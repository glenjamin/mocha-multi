'use strict';

// These lines make "require" available
// see https://www.kindacode.com/article/node-js-how-to-use-import-and-require-in-the-same-file/
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const Mocha = require('mocha');

const logger = console;

const {
  EVENT_RUN_BEGIN,
  EVENT_RUN_END,
  EVENT_TEST_BEGIN,
  EVENT_TEST_FAIL,
  EVENT_TEST_PASS,
  EVENT_TEST_PENDING,
  EVENT_TEST_END,
} = Mocha.Runner.constants;

class CustomEsmReporter {
  constructor(runner, reporterOptionsWrapper) {
    logger.log(reporterOptionsWrapper);
    this.options = reporterOptionsWrapper.reporterOptions;
    runner
      .once(EVENT_RUN_BEGIN, () => {
        logger.log('Starting the run');
        logger.log('option1: ' + this.options.option1);
        logger.log('option2: ' + this.options.option2);
      })
      .on(EVENT_TEST_BEGIN, () => {
        logger.info('Starting test');
      })
      .on(EVENT_TEST_PASS, (test) => {
        logger.log(`Finished test ${test.title}: pass`);
      })
      .on(EVENT_TEST_FAIL, (test) => {
        logger.log(`Finished test ${test.title}: fail`);
      })
      .on(EVENT_TEST_PENDING, (test) => {
        logger.log(`Finished test ${test.title}: pending/skipped`);
      })
      .on(EVENT_TEST_END, () => {
        logger.log('EVENT_TEST_END');
      })
      .once(EVENT_RUN_END, async () => {
        logger.log('EVENT_RUN_END');
      });
  }
}

export default CustomEsmReporter;
