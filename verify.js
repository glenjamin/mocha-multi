var Mocha = require('mocha'), 
    should=require('should'),
    fs=require('fs'),
    Q=require('q'),
    debug = require('debug')('mocha:multi');

var reporters=[
    "dot", "doc", "spec", "json", "progress",
    "list", "tap", "landing", "xunit", "min",
    "json-stream", "markdown", "nyan"
], deferreds=[], now=new Date();

should(process.env['multi']).not.be.ok;

reporters.forEach(function(r) {
    var reporter=r, reporterOptions={}, deferred;
    reporterOptions[reporter]={ 
        stdout:"/tmp/mocha-multi."+reporter+"."+now
    };
    deferred=Q.defer();
    deferreds.push( deferred.promise );
    var mocha = new Mocha({
        ui: 'bdd',
        reporter: "mocha-multi",
        reporterOptions:reporterOptions
    });
    mocha.addFile("test/dummy-spec.js");
    mocha.run(function onRun(failures){
        deferred.resolve({});
    });
});
Q.all(deferreds).then(function() {
    process.on('exit', function onExit() {
        reporters.forEach(function(reporter) {
            fs.statSync("/tmp/mocha-multi."+reporter+"."+now).should.be.ok;
            fs.unlinkSync("/tmp/mocha-multi."+reporter+"."+now);
        });
    });
});
    