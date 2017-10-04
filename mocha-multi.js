const fs = require('fs');
const util = require('util');
const assign = require('object-assign');
const debug = require('debug')('mocha:multi');
const path = require('path');
const isString = require('is-string');
const mkdirp = require('mkdirp');

// Let mocha decide about tty early
require('mocha/lib/reporters/base');

module.exports = MochaMulti;

// Make sure we don't lose these!
const { stdout, stderr } = process;

function MochaMulti(runner, options) {
  let setup;
  this.options = options;
  // keep track of reporters that have a done method.
  this.reportersWithDone = [];
  const reporters = (options && options.reporterOptions);
  if (reporters && Object.keys(reporters).length > 0) {
    debug('options %j', options);
    setup = Object.keys(reporters).map((reporter) => {
      debug('adding reporter %j %j', reporter, reporters[reporter]);
      const r = reporters[reporter];

      if (isString(r)) {
        return [reporter, r, null];
      }

      return [reporter, r.stdout, r.options];
    });
  } else {
    setup = parseSetup();
  }
  debug('setup %j', setup);
  let streams = initReportersAndStreams(runner, setup, this);
  // Remove nulls
  streams = streams.filter(identity);

  // we actually need to wait streams only if they are present
  if (streams.length > 0) {
    awaitStreamsOnExit(streams);
  }
}

/**
 * Override done to allow done processing for any reporters that have a done method.
 */
MochaMulti.prototype.done = function (failures, fn) {
  const self = this;

  if (self.reportersWithDone.length !== 0) {
    let count = self.reportersWithDone.length;
    debug('Awaiting on %j reporters to invoke done callback.', count);
    const cb = () => {
      count -= 1;
      if (count <= 0) {
        debug('All reporters invoked done callback.');
        fn(failures);
      } else {
        debug('Awaiting on %j reporters to invoke done callback.', count);
      }
    };

    self.reportersWithDone.forEach((r) => {
      r.done(failures, cb);
    });
  } else {
    debug('No reporters have done method, completing.');
    fn(failures);
  }
};

const msgs = {
  no_definitions: 'reporter definitions should be set in ' +
                  'the `multi` shell variable\n' +
                  "eg. `multi='dot=- xunit=file.xml' mocha`",
  invalid_definition: "'%s' is an invalid definition\n" +
                      'expected <reporter>=<destination>',
  invalid_reporter: "Unable to find '%s' reporter",
};
function bombOut(id) {
  const args = Array.prototype.slice.call(arguments, 0);
  args[0] = `ERROR: ${msgs[id]}`;
  stderr.write(`${util.format(...args)}\n`);
  process.exit(1);
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

function parseReporter(definition) {
  const pair = definition.split('=');
  if (pair.length != 2) {
    bombOut('invalid_definition', definition);
  }
  return pair;
}

function initReportersAndStreams(runner, setup, multi) {
  return setup.map((definition) => {
    const reporter = definition[0];
    const outstream = definition[1];
    const options = definition[2];

    debug("Initialising reporter '%s' to '%s' with options %j", reporter, outstream, options);

    const stream = resolveStream(outstream);
    const shim = createRunnerShim(runner, stream);

    debug("Shimming runner into reporter '%s' %j", reporter, options);

    withReplacedStdout(stream, () => {
      const Reporter = resolveReporter(reporter);
      const r = new Reporter(shim, assign({}, multi.options, {
        reporterOptions: options || {},
      }));
      // If the reporter possess a done() method register it so we can
      // wait for it to complete when done.
      if (r && r.done) {
        multi.reportersWithDone.push(r);
      }
      return r;
    });

    return stream;
  });
}

function awaitStreamsOnExit(streams) {
  const { exit } = process;
  let num = streams.length;
  process.exit = (code) => {
    const quit = exit.bind(process, code);
    streams.forEach((stream) => {
      stream.end(() => {
        num -= 1;
        onClose();
      });
    });
    function onClose() {
      if (num === 0) {
        quit();
      }
    }
  };
}

function resolveReporter(name) {
  // Cribbed from Mocha.prototype.reporter()
  let reporter;
  reporter = safeRequire(`mocha/lib/reporters/${name}`);
  if (!reporter) {
    reporter = safeRequire(name);
  }
  if (!reporter) {
    bombOut('invalid_reporter', name);
  }
  debug("Resolved reporter '%s' into '%s'", name, util.inspect(reporter));
  return reporter;
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

function resolveStream(destination) {
  if (destination == '-') {
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

function createRunnerShim(runner, stream) {
  const shim = new (require('events').EventEmitter)();

  addDelegate('grepTotal');
  addDelegate('suite');
  addDelegate('total');

  function addDelegate(prop) {
    shim.__defineGetter__(prop, () => {
      let property = runner[prop];
      if (typeof property === 'function') {
        property = property.bind(runner);
      }
      return property;
    });
  }

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

function withReplacedStdout(stream, func) {
  if (!stream) {
    return func();
  }

  // The hackiest of hacks
  debug('Replacing stdout');

  const stdoutGetter = Object.getOwnPropertyDescriptor(process, 'stdout').get;
  const stderrGetter = Object.getOwnPropertyDescriptor(process, 'stderr').get;

  console._stdout = stream;
  console._stderr = stream;
  process.__defineGetter__('stdout', () => stream);
  process.__defineGetter__('stderr', () => stream);

  try {
    func();
  } finally {
    console._stdout = stdout;
    console._stderr = stderr;
    process.__defineGetter__('stdout', stdoutGetter);
    process.__defineGetter__('stderr', stderrGetter);
    debug('stdout restored');
  }
}

function identity(x) {
  return x;
}
