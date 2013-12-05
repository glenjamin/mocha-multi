mocha-multi
===========

A bit of a hack to get multiple reporters working with mocha

Usage
-----

    npm install mocha-multi --save-dev
    mocha --reporter mocha-multi --no-exit

No exit must be used to ensure the various streams finish writing.

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
