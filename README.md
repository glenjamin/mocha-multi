mocha-multi
===========

A bit of a hack to get multiple reporters working with mocha

[![Build Status](https://travis-ci.org/glenjamin/mocha-multi.png?branch=master)](https://travis-ci.org/glenjamin/mocha-multi)
[![NPM version](https://badge.fury.io/js/mocha-multi.png)](http://badge.fury.io/js/mocha-multi)

Usage
-----

    npm install mocha-multi --save-dev
    mocha --reporter mocha-multi

Choosing Reporters
------------------

For both methods below, the special value of `-` (hyphen) for destination uses normal stdout/stderr.

### With the `multi` Environment Variable

Set the environment variable `multi` to whitespace-separated type=destination pairs.

```bash
multi='dot=- xunit=file.xml doc=docs.html' mocha -R mocha-multi
```

### With `--reporter-options`

Pass `--reporter-options` with comma-separated type=destination pairs.

```bash
mocha -R mocha-multi --reporter-options dot=-,xunit=file.xml,doc=docs.html
```

Using mocha-multi programmatically
----------------------------------

You may specify the desired reporters (and their options) by passing `reporterOptions` to the Mocha contructor.

For example: the following config is the equivalent of setting `multi='spec=- Progress=/tmp/mocha-multi.Progress.out'`, with the addition of passing the `verbose: true` option to the Progress reporter.

```sh
var reporterOptions = {
	Progress: {
		stdout: "/tmp/mocha-multi.Progress.out",
		options: {
			verbose: true
		}
	},
	spec: "-"
};

var mocha = new Mocha({
    ui: "bdd"
    reporter: "mocha-multi",
    reporterOptions: reporterOptions
});
mocha.addFile("test/dummy-spec.js");
mocha.run(function onRun(failures){
    console.log(failures);
});
```

The options will be passed as the second argument to the reporter constructor.

How it works
------------

A big hack that keeps changing the value of process.stdout and process.stderr whenever a reporter is doing its thing.

Seriously?
----------

Yeah, Sorry!

All the hacks
-------------

This is very hacky, specifically:

 * The `process` and `console` objects get their internal state messed with
 * `process.exit` is hacked to wait for streams to finish writing
 * Only works if reporters queue writes synchronously in event handlers

Could this be a bit less hacky?
-------------------------------

 * Now that visionmedia/mocha#1059 is released the process.exit hack could be tidier

 * If visionmedia/mocha#1061 is accepted upstream, I only need to hijack stdout, and can leave stderr alone

 * Having each reporter run in a child process would make it eaiser to capture their streams, but might lead to other issues

TODO
----

* Update hack now that visionmedia/mocha#1059 is merged
* Add tests for coverage reports
* Add tests which produce multiple reports at once
* Add test for help text
* Add test that uses --no-exit
* Add test that doesn't use _mocha (maybe not?)
