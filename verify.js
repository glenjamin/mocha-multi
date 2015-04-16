var Mocha = require('mocha'), 
    should=require('should'),
    fs=require('fs'),
    debug = require('debug')('mocha:multi'),
    async = require('async');

var reporters=[
    "dot", "doc", "spec", "json", "progress",
    "list", "tap", "landing", "xunit", "min",
    "json-stream", "markdown", "nyan"
], deferreds=[], now=new Date();

should(process.env['multi']).not.be.ok;

async.eachSeries(reporters, function(r, next) {
    var reporter=r, reporterOptions={}, deferred;
    debug("reporter %s", reporter);
    reporterOptions[reporter]={ 
        stdout:"/tmp/mocha-multi."+reporter+"."+now
    };
    debug("reporterOptions %j", reporterOptions);
    var mocha = new Mocha({
        ui: 'bdd',
        reporter: "mocha-multi",
        reporterOptions:reporterOptions
    });
    mocha.addFile("test/dummy-spec.js");
    mocha.run(function onRun(failures){
        debug("done running %j", reporter);
        next();
    });
}, function(err, results) {
    reporters.forEach(function(reporter) {
        (function(){fs.statSync("/tmp/mocha-multi."+reporter+"."+now);}).should.not.throw();
        fs.unlinkSync("/tmp/mocha-multi."+reporter+"."+now);
    });
});
