const fs = require('fs');
const once = require('lodash.once');
const util = require('util');
const assign = require('object-assign');
const debug = require('debug')('mocha:multi');
const path = require('path');
const isString = require('is-string');
const mkdirp = require('mkdirp');

// Let mocha decide about tty early
require('mocha/lib/reporters/base');

// Make sure we don't lose these!
const { stdout } = process;

function defineGetter(obj, prop, get) {
  Object.defineProperty(obj, prop, { get });
}
const waitOn = fn => v => new Promise(resolve => fn(v, () => resolve()));
const waitStream = waitOn((r, fn) => r.end(fn));

function awaitOnExit(waitFor) {
  if (!waitFor) {
    return;
  }
  const { exit } = process;
  process.exit = function mochaMultiExitPatch(...args) {
    const quit = exit.bind(this, ...args);
    if (process._exiting) {
      return quit();
    }
    waitFor().then(quit);
    return undefined;
  };
}

function identity(x) {
  return x;
}

const msgs = {
  no_definitions: 'reporter definitions should be set in ' +
                  'the `multi` shell variable\n' +
                  "eg. `multi='dot=- xunit=file.xml' mocha`",
  invalid_definition: "'%s' is an invalid definition\n" +
                      'expected <reporter>=<destination>',
  invalid_reporter: "Unable to find '%s' reporter",
};
function bombOut(id, ...args) {
  const newArgs = [`ERROR: ${msgs[id]}`, ...args];
  process.stderr.write(`${util.format(...newArgs)}\n`);
  process.exit(1);
}

function parseReporter(definition) {
  const pair = definition.split('=');
  if (pair.length !== 2) {
    bombOut('invalid_definition', definition);
  }
  return pair;
}

function parseSetup() {
  const reporterDefinition = process.env.multi || '';
  const reporterDefs = reporterDefinition.trim().split(/\s/).filter(identity);
  if (!reporterDefs.length) {
    bombOut('no_definitions');
  }
  debug('Got reporter defs: %j', reporterDefs);
  return reporterDefs.map(parseReporter);
}

function resolveStream(destination) {
  if (destination === '-') {
    debug("Resolved stream '-' into stdout and stderr");
    return null;
  }
  debug("Resolved stream '%s' into writeable file stream", destination);
  // Create directory if not existing
  const destinationDir = path.dirname(destination);
  if (!fs.existsSync(destinationDir)) {
    mkdirp.sync(destinationDir);
  }

  // Ensure we can write here
  fs.writeFileSync(destination, '');
  return fs.createWriteStream(destination);
}

function safeRequire(module) {
  try {
    return require(module);
  } catch (err) {
    if (!/Cannot find/.exec(err.message)) {
      throw err;
    }
    return null;
  }
}

function resolveReporter(name) {
  // Cribbed from Mocha.prototype.reporter()
  const reporter = (
    safeRequire(`mocha/lib/reporters/${name}`) ||
    safeRequire(name) ||
    bombOut('invalid_reporter', name)
  );
  debug("Resolved reporter '%s' into '%s'", name, util.inspect(reporter));
  return reporter;
}

function withReplacedStdout(stream, func) {
  if (!stream) {
    return func();
  }

  // The hackiest of hacks
  debug('Replacing stdout');

  const stdoutGetter = Object.getOwnPropertyDescriptor(process, 'stdout').get;

  // eslint-disable-next-line no-console
  console._stdout = stream;
  defineGetter(process, 'stdout', () => stream);

  try {
    return func();
  } finally {
    // eslint-disable-next-line no-console
    console._stdout = stdout;
    defineGetter(process, 'stdout', stdoutGetter);
    debug('stdout restored');
  }
}

function createRunnerShim(runner, stream) {
  const shim = new (require('events').EventEmitter)();

  function addDelegate(prop) {
    defineGetter(shim, prop, () => {
      const property = runner[prop];
      if (typeof property === 'function') {
        return property.bind(runner);
      }
      return property;
    });
  }

  addDelegate('grepTotal');
  addDelegate('suite');
  addDelegate('total');

  const delegatedEvents = {};

  shim.on('newListener', (event) => {
    if (event in delegatedEvents) return;

    delegatedEvents[event] = true;
    debug("Shim: Delegating '%s'", event);

    runner.on(event, (...eventArgs) => {
      eventArgs.unshift(event);

      withReplacedStdout(stream, () => {
        shim.emit(...eventArgs);
      });
    });
  });

  return shim;
}

function initReportersAndStreams(runner, setup, multiOptions) {
  return setup
    .map(([reporter, outstream, options]) => {
      debug("Initialising reporter '%s' to '%s' with options %j", reporter, outstream, options);

      const stream = resolveStream(outstream);
      const shim = createRunnerShim(runner, stream);

      debug("Shimming runner into reporter '%s' %j", reporter, options);

      return withReplacedStdout(stream, () => {
        const Reporter = resolveReporter(reporter);
        return {
          stream,
          reporter: new Reporter(shim, assign({}, multiOptions, {
            reporterOptions: options || {},
          })),
        };
      });
    });
}

function promiseProgress(items, fn) {
  let count = 0;
  fn(count);
  items.forEach(v => v.then(() => {
    count += 1;
    fn(count);
  }));
  return Promise.all(items);
}


/**
 * Override done to allow done processing for any reporters that have a done method.
 */
function done(failures, fn, reportersWithDone, waitFor = identity) {
  const count = reportersWithDone.length;
  const waitReporter = waitOn((r, f) => r.done(failures, f));
  const progress = v => debug('Awaiting on %j reporters to invoke done callback.', count - v);
  promiseProgress(reportersWithDone.map(waitReporter), progress)
    .then(() => {
      debug('All reporters invoked done callback.');
    })
    .then(waitFor)
    .then(() => fn && fn(failures));
}

function mochaMulti(runner, options) {
  // keep track of reporters that have a done method.
  const reporters = (options && options.reporterOptions);
  const setup = (() => {
    if (reporters && Object.keys(reporters).length > 0) {
      debug('options %j', options);
      return Object.keys(reporters).map((reporter) => {
        debug('adding reporter %j %j', reporter, reporters[reporter]);
        const r = reporters[reporter];

        if (isString(r)) {
          return [reporter, r, null];
        }

        return [reporter, r.stdout, r.options];
      });
    }
    return parseSetup();
  })();
  debug('setup %j', setup);
  // If the reporter possess a done() method register it so we can
  // wait for it to complete when done.
  const reportersAndStreams = initReportersAndStreams(runner, setup, options);
  const streams = reportersAndStreams
    .map(v => v.stream)
    .filter(identity);
  const reportersWithDone = reportersAndStreams
    .map(v => v.reporter)
    .filter(v => v.done);

  // we actually need to wait streams only if they are present
  const waitFor = streams.length > 0 ?
    once(() => Promise.all(streams.map(waitStream))) :
    undefined;

  awaitOnExit(waitFor);

  if (reportersWithDone.length > 0) {
    return {
      done: (failures, fn) => done(failures, fn, reportersWithDone, waitFor),
    };
  }

  return {};
}

class MochaMulti {
  constructor(runner, options) {
    Object.assign(this, mochaMulti(runner, options));
  }
}

module.exports = MochaMulti;
