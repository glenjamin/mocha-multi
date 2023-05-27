mocha-multi
===========

A bit of a hack to get multiple reporters working with mocha

[![Build Status](https://travis-ci.org/glenjamin/mocha-multi.svg?branch=master)](https://travis-ci.org/glenjamin/mocha-multi)
[![NPM version](https://img.shields.io/npm/v/mocha-multi.svg)](https://www.npmjs.com/package/mocha-multi)

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

### From a file

Using either of the above methods, include a type=destination pair where the type is mocha-multi and the destination is a filename, e.g. `mocha-multi=mocha-multi-reporters.json`

More reporters will be loaded from the named file, which must be valid JSON in the same data format described below for passing reporterOptions to Mocha programmatically.

Using mocha-multi programmatically
----------------------------------

You may specify the desired reporters (and their options) by passing `reporterOptions` to the Mocha contructor.

For example: the following config is the equivalent of setting `multi='spec=- Progress=/tmp/mocha-multi.Progress.out'`, with the addition of passing the `verbose: true` option to the Progress reporter.

```javascript
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

Using mocha-multi programmatically with custom reporters built in ESM
---------------------------------------------------------------------

To load a custom reporter built in ESM, you must pass the class name into the mocha-multi reporter options. When using reporter names passed in as strings, Mocha attempts to load them as CommonJS modules, using require, which won't work. Here is an example loading an ESM custom reporter programmatically. 

**mocha-run-esm-reporter.mjs**:

```javascript
import Mocha from 'mocha';

// These lines make "require" available
// see https://www.kindacode.com/article/node-js-how-to-use-import-and-require-in-the-same-file/
import { createRequire } from 'module';
global.require = createRequire(import.meta.url);

const Reporter = (await import('./custom-esm-reporter.mjs')).default;

const mocha = new Mocha({
    reporter: "mocha-multi",
    reporterOptions: {
        spec: "-",
        customEsmReporter: {
            "constructorFn": Reporter,
            "stdout": "/tmp/custom-esm-reporter.stdout",
            "options": {
                "option1": "value1",
                "option2": "value2"
            }
        }
    }
});

// this is required to load the globals (describe, it, etc) in the test files
mocha.suite.emit('pre-require', global, 'nofile', mocha);

// dynamic import works for both cjs and esm.
await import('./test/dummy-spec.js');
await import('./test/dummy-spec.mjs');

// require only works for cjs, not for esm.
// require('./test/dummy-spec.js');
// require('./test/dummy-spec.mjs');


const suiteRun = mocha.run();

process.on('exit', (code) => {
    process.exit(suiteRun.stats.failures);
});
```

To run programmatically, just use node:

```
$ node mocha-run-esm-reporter.mjs
```

(Note that CommonJS reporters can also be loaded in this manner)


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

 * Now that https://github.com/mochajs/mocha/pull/1059 is released the process.exit hack could maybe be tidier

 * Having each reporter run in a child process would make it eaiser to capture their streams, but might lead to other issues

TODO
----

* Add tests for coverage reports
* Add tests which produce multiple reports at once
* Add test for help text
* Add test that uses --no-exit

HISTORY
-------

### 1.0.0 (unreleased)

The breaking changes are mostly around internals, and shouldn't affect most people.

* BREAKING: MochaMulti.prototype.done removed, new MochaMulti(...).done now optional
* BREAKING: new MochaMulti(...).options removed
* BREAKING: Must run at least mocha@>=2.2.0
* BREAKING: Must run at least node@>=6.0.0
* Correctly set exit code when writing to files
* Declare support for mocha@^4.0.0
* Support running mocha without a run callback
* Upgrade to ES2015+ via eslint-preset-airbnb-base (MochaMulti is an ES class)
* Avoid patching stderr, now that mocha does not write to it
