var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');
var recursive = require('recursive-readdir');
var _ = require('lodash');

var isProduction = process.argv.some(function(option) {
    return option === '--production'
});
var isDryrun = process.argv.some(function(option) {
    return option === '--dryrun'
});
var settingFile = path.join(__dirname, 'conf', (isProduction) ? 'production.yaml' : 'development.yaml');
var setting;
var targetFiles = [];

if (!fs.existsSync(settingFile)) {
    throw new Error('"' + settingFile + '" not found.');
    process.exit(1);
} else {
    try {
        setting = yaml.safeLoad(fs.readFileSync(settingFile, 'utf8'));
    } catch (e) {
        throw e;
        process.exit(1);
    }
}

console.log('##### ts2mp4 with handbrake #####');
console.time('ts2mp4');

recursive(setting.src_dir, function(err, files) {
    if (err) {
        throw err;
        process.exit(1);
    }
    files.forEach(function(file) {
        if (path.extname(file) === '.ts') {
            targetFiles.push(file);
        }
    });
    console.log(targetFiles.length + 'fire(s) found');
    next();
});

function next() {
    var targetFile = targetFiles.shift();

    if (!targetFile) {
        console.log('\n===============================================');
        console.timeEnd('ts2mp4');
        console.log('Complete!');
        process.exit(0);
    }
    convert(targetFile, function(code, file) {
        if (code != 0) {
            return;
        }
        remove(file);
    });
}

function remove(file) {
    if (isDryrun) {
        console.log('unlink: ' + file);
        return;
    } else if (!isProduction) {
        return;
    }
    console.log('unlink: ' + file);
    fs.unlinkSync(file)
}

function convert(file, callback) {
    console.log('\n===============================================');

    var outputFilePath = path.join(setting.output_dir, file.substr(setting.src_dir.length + path.sep.length)).replace(/\.ts$/, '.mp4');
    var cliOptions = makeOption({
            '-i': file,
            '-o': outputFilePath
    });

    console.log('exec: ', setting.handbrake_cli_path, cliOptions.join(' '))
    if (isDryrun) {
        callback && callback(0, file);
        next();
        return;
    } else if (!fs.existsSync(path.dirname(outputFilePath))) {
        fs.mkdirSync(path.dirname(outputFilePath));
    }
    var handbrake = child_process.spawn(setting.handbrake_cli_path, cliOptions);
    var stdoutBuf = new Buffer(0);
    var stderrBuf = new Buffer(0);

    handbrake.stdout.on('readable', function() {
        var chunk;

        while (chunk = handbrake.stdout.read()) {
            stdoutBuf = Buffer.concat([
                stdoutBuf,
                chunk
            ], stdoutBuf.length + chunk.length);
        }
    })
    handbrake.stdout.on('end', function() {
        if (stdoutBuf.length) {
            console.log(stdoutBuf.toString('utf8'));
        }
    });
    handbrake.stderr.on('readable', function() {
        var chunk;

        while (chunk = handbrake.stderr.read()) {
            stderrBuf = Buffer.concat([
                stderrBuf,
                chunk
            ], stderrBuf.length + chunk.length);
        }
    })
    handbrake.stderr.on('end', function() {
        if (stderrBuf.length) {
            console.log(stderrBuf.toString('utf8'));
        }
    });
    handbrake.on('close', function(code) {
        console.log('handbrake exit.', arguments);
        callback && callback(code, file);
        next();
    });
}

function makeOption(options) {
    var opts = _.extend({}, setting.handbrake_options, options);
    var res = [];

    _.each(opts, function(val, key) {
        if (/^--/.test(key)) {
            if (!val) {
                res.push(key)
            } else {
                res.push(key + '=' + val);
            }
        } else {
            res.push(key);
            val && res.push(val);
        }
    });
    return res;
}

