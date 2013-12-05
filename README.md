mocha-multi
===========

A bit of a hack to get multiple reporters working with mocha

Usage
-----

    npm install mocha-multi --save-dev
    mocha --reporter mocha-multi --no-exit

No exit will be forced on to ensure the various streams finish writing.

Choosing Reporters
------------------

Nothing in mocha uses stdin, so lets abuse that.

    echo dot=- xunit=file.xml html=tests.html | mocha -R mocha-multi

Special values: `-` for normal stdout/stderr

How it works
------------

A big hack that keeps changing the value of process.stdout and process.stderr
whenever a reporter is doing its thing.

Seriously?
----------

Yeah, Sorry!

All the hacks
-------------

This is very hacky, specifically:

 * Stdin is assumed to be synchronously readable and <1k
 * The `process` and `console` objects get their internal state messed with
 * `process.exit` is hacked to wait for streams to finish writing

TODO
----

Verify the reporter output automatically.

Perhaps use another process to run with/without multi and compare output?
