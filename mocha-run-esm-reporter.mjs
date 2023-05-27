import Mocha from 'mocha';

// These lines make "require" available
// see https://www.kindacode.com/article/node-js-how-to-use-import-and-require-in-the-same-file/
import { createRequire } from 'module';
global.require = createRequire(import.meta.url);

// you can use import, but dynamic import sometimes helps with transpilers
const Reporter = (await import('./custom-esm-reporter.mjs')).default;

const mocha = new Mocha({
    reporter: "mocha-multi",
    reporterOptions: {
        spec: "-",
        customEsmReporter: {
            "constructorFn": Reporter,
            //"stdout": "/tmp/custom-esm-reporter.stdout",
            "stdout": process.env.MOCHA_MULTI_TMP_STDOUT || "/tmp/custom-esm-reporter.stdout", 
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
await import('./test/dummy-spec.mjs');
await import('./test/dummy-spec.js');

// require only works for cjs, not for esm.
// require('./test/dummy-spec.js');
// require('./test/dummy-spec.mjs');


const suiteRun = mocha.run();

process.on('exit', (code) => {
    process.exit(suiteRun.stats.failures);
});
