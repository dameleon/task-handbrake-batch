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
        process.exit(1);
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
    fs.unlinkSync(file)
}

function convert(file, callback) {
    console.log('\n===============================================');

    var cliOptions = makeOption({
            '--input': file,
            '--output': path.join(setting.output_dir, file.substr(setting.src_dir.length + path.sep.length))
    });

    console.log('exec: ', setting.handbrake_cli_path, cliOptions.join(' '))
    if (isDryrun) {
        callback && callback(0, file);
        next();
        return;
    } else {
        fs.mkdirSync(path.dirname(cliOptions['--output']));
    }
    var handbrake = child_process.spawn(setting.handbrake_cli_path, cliOptions);

    handbrake.stdout.on('data', function(data) {
        console.log(data.toString('utf8'));
    });
    handbrake.stderr.on('data', function(data) {
        console.error(data.toString('utf8'));
    });
    handbrake.stderr.on('end', function() {
        console.error('handbrake is error.');
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

