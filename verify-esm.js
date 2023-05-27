const Mocha = require('mocha');
const should = require('should');
const fs = require('fs');
const debug = require('debug')('mocha:verify:multi');
const async = require('async');
const chalk = require('chalk');

(async () => {

  const customEsmReporter = (await import('./custom-esm-reporter.mjs')).default;

  const reporters = [
    'dot', 'spec', 'json', 'progress',
    'list', 'tap', 'landing', 'xunit', 'min',
    'json-stream', 'markdown', 'nyan', 
    'customEsmReporter'
  ];
  const now = new Date();

  function tempName(reporter) {
    return `/tmp/mocha-multi.${reporter}.${+now}`;
  }

  const customEsmOptions = {
    option1: 'value1',
    option2: 'value2'
  }

  const reportersWithOptions = []
    .concat(reporters.map((reporter) => {
      const outFilename = tempName(`${reporter}-stdout`);
      const options = {};
      options[reporter] = {
        stdout: outFilename,
      };
      if(reporter === 'customEsmReporter') {
        options.customEsmReporter.options = [];
        Object.keys(customEsmOptions).reduce((acc, key) => {
          options.customEsmReporter.options[key] = customEsmOptions[key];
          //acc = options;
          //return acc;
        }, {});
        options.customEsmReporter.constructorFn = customEsmReporter;
      }
      return {
        testName: `${reporter} (with custom options and constructorFn)`,
        outFilename,
        options
      };
    }))
    // .concat(reporters.map((reporter) => {
    //   const outFilename = tempName(`${reporter}-str`);
    //   const options = {};
    //   options[reporter] = outFilename;
    //   return {
    //     testName: `${reporter} (with options as string)`,
    //     outFilename,
    //     options,
    //   };
    // }));

  should(process.env.multi).not.be.ok;

  process.setMaxListeners(reportersWithOptions.length);

  async.eachSeries(reportersWithOptions, (reporter, next) => {
    debug('reporter %s', reporter.testName);
    debug('reporterOptions %j', reporter.options);
    const mocha = new Mocha({
      ui: 'bdd',
      reporter: 'mocha-multi',
      reporterOptions: reporter.options,
    });
    mocha.addFile('test/dummy-spec.js');
    mocha.run(() => {
      debug('done running %j', reporter.testName);
      process.nextTick(next);
    });
  }, () => {
    reportersWithOptions.forEach((reporter) => {
      fs.statSync.bind(fs, reporter.outFilename).should.not.throw();
      fs.unlinkSync(reporter.outFilename);
      // eslint-disable-next-line no-console
      console.log(chalk.green('%s OK'), reporter.testName);
    });
  });

})();
