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
], deferreds = [], now = new Date();

should(process.env.multi).not.be.ok;

function tempName(reporter) {
    return "/tmp/mocha-multi." + reporter + "." + (+now);
}

process.setMaxListeners(reporters.length);

async.eachSeries(reporters, function(reporter, next) {
    var reporterOptions = {};
    debug("reporter %s", reporter);
    reporterOptions[reporter] = {
        stdout: tempName(reporter)
    };
    debug("reporterOptions %j", reporterOptions);
    var mocha = new Mocha({
        ui: 'bdd',
        reporter: "mocha-multi",
        reporterOptions: reporterOptions
    });
    mocha.addFile("test/dummy-spec.js");
    mocha.run(function onRun(failures){
        debug("done running %j", reporter);
        process.nextTick(next);
    });
}, function(err, results) {
    reporters.forEach(function(reporter) {
        fs.statSync.bind(fs, tempName(reporter)).should.not.throw();
        fs.unlinkSync(tempName(reporter));
        console.log(chalk.green("%s OK"), reporter);
    });
});
