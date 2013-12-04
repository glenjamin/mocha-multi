mocha-multi
===========

A bit of a hack to get multiple reporters working with mocha

Usage
-----

    npm install mocha-multi --save-dev
    mocha -R mocha-multi

Choosing Reporters
------------------

Nothing in mocha uses stdin, so lets abuse that.

    echo dot=1 xunit=file.xml html=tests.html | mocha -R mocha-multi

Special values: `1` for stdout and `2` for stderr
