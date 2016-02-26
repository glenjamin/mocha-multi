var Mocha = require('mocha'),
    should=require('should'),
    fs=require('fs'),
    debug = require('debug')('mocha:verify:multi'),
    async = require('async'),
    chalk = require('chalk');

var reporters = [
    "dot", "doc", "spec", "json", "progress",
    "list", "tap", "landing", "xunit", "min",
    "json-stream", "markdown", "nyan"
], now = new Date();

var reportersWithOptions = []
    .concat(reporters.map(function (reporter) {
        var outFilename = tempName(reporter + '-stdout');
        var options = {};
        options[reporter] = {
            stdout: outFilename
        };
        return {
            testName: reporter + ' (with options.stdout)',
            outFilename: outFilename,
            options: options
        };
    }))
    .concat(reporters.map(function (reporter) {
        var outFilename = tempName(reporter + '-str');
        var options = {};
        options[reporter] = outFilename;
        return {
            testName: reporter + ' (with options as string)',
            outFilename: outFilename,
            options: options
        };
    }));


should(process.env.multi).not.be.ok;

function tempName(reporter) {
    return "/tmp/mocha-multi." + reporter + "." + (+now);
}

process.setMaxListeners(reportersWithOptions.length);

async.eachSeries(reportersWithOptions, function(reporter, next) {
    debug("reporter %s", reporter.testName);
    debug("reporterOptions %j", reporter.options);
    var mocha = new Mocha({
        ui: 'bdd',
        reporter: "mocha-multi",
        reporterOptions: reporter.options
    });
    mocha.addFile("test/dummy-spec.js");
    mocha.run(function onRun(failures){
        debug("done running %j", reporter.testName);
        process.nextTick(next);
    });
}, function(err, results) {
    reportersWithOptions.forEach(function(reporter) {
        fs.statSync.bind(fs, reporter.outFilename).should.not.throw();
        fs.unlinkSync(reporter.outFilename);
        console.log(chalk.green("%s OK"), reporter.testName);
    });
});
