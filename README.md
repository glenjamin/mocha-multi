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

Set an environment variable called `multi` to specify the desired reporters.
Reporters are listed as whitespace separated type=destination pairs.

```bash
multi='dot=- xunit=file.xml doc=docs.html' mocha -R mocha-multi
```

The special value of `-` (hyphen) for destination uses normal stdout/stderr.

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
