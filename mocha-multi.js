var fs = require('fs');
var util = require('util');
var debug = require('debug')('mocha:multi');
var path = require('path');
var isString = require('is-string');
var mkdirp = require('mkdirp');

// Let mocha decide about tty early
require('mocha/lib/reporters/base');

module.exports = MochaMulti

// Make sure we don't lose these!
var stdout = process.stdout;
var stderr = process.stderr;

function MochaMulti(runner, options) {
  var setup;
  var reporters = (options && options.reporterOptions);
  if (reporters && Object.keys(reporters).length > 0) {
    debug("options %j", options);
    setup = [];
    Object.keys(reporters).forEach(function(reporter) {
      debug("adding reporter %j %j", reporter, reporters[reporter]);

      var stdout;
      var options;
      if (isString(reporters[reporter])) {
        stdout = reporters[reporter];
        options = null;
      } else {
        stdout = reporters[reporter].stdout;
        options = reporters[reporter].options;
      }

      setup.push([ reporter, stdout, options ]);
    });
  } else {
    setup = parseSetup();
  }
  debug("setup %j", setup);
  var streams = initReportersAndStreams(runner, setup);
  // Remove nulls
  streams = streams.filter(identity);

  //we actually need to wait streams only if they are present
  if(streams.length > 0) {
    awaitStreamsOnExit(streams);
  }
}

var msgs = {
  no_definitions: "reporter definitions should be set in \
the `multi` shell variable\n\
eg. `multi='dot=- xunit=file.xml' mocha`",
  invalid_definition: "'%s' is an invalid definition\n\
expected <reporter>=<destination>",
  invalid_reporter: "Unable to find '%s' reporter"
}
function bombOut(id) {
  var args = Array.prototype.slice.call(arguments, 0);
  args[0] = 'ERROR: ' + msgs[id];
  stderr.write(util.format.apply(util, args) + "\n");
  process.exit(1);
}

function parseSetup() {
  var reporterDefinition = process.env.multi || '';
  var reporterDefs = reporterDefinition.trim().split(/\s/).filter(identity);
  if (!reporterDefs.length) {
    bombOut('no_definitions');
  }
  debug("Got reporter defs: %j", reporterDefs);
  return reporterDefs.map(parseReporter);
}

function parseReporter(definition) {
  var pair = definition.split('=');
  if (pair.length != 2) {
    bombOut('invalid_definition', definition);
  }
  return pair;
}

function initReportersAndStreams(runner, setup) {
  return setup.map(function(definition) {
    var reporter=definition[0], outstream=definition[1], options=definition[2]

    debug("Initialising reporter '%s' to '%s' with options %j", reporter, outstream, options);

    var stream = resolveStream(outstream);
    var shim = createRunnerShim(runner, stream);

    debug("Shimming runner into reporter '%s' %j", reporter, options);

    withReplacedStdout(stream, function() {
      var Reporter = resolveReporter(reporter);
      return new Reporter(shim, options || {});
    })

    return stream;
  })
}

function awaitStreamsOnExit(streams) {
  var exit = process.exit;
  var num = streams.length;
  process.exit = function(code) {
    var quit = exit.bind(process, code);
    streams.forEach(function(stream) {
      stream.end(function() {
        num--;
        onClose();
      });
    });
    function onClose() {
      if(num === 0) {
        quit();
      }
    }
  };
}

function resolveReporter(name) {
  // Cribbed from Mocha.prototype.reporter()
  var reporter;
  reporter = safeRequire('mocha/lib/reporters/' + name);
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
  var destinationDir = path.dirname(destination);
  if (!fs.existsSync(destinationDir)){
    mkdirp.sync(destinationDir);
  }

  // Ensure we can write here
  fs.writeFileSync(destination, '');
  return fs.createWriteStream(destination);
}

function createRunnerShim(runner, stream) {
  var shim = new (require('events').EventEmitter)();

  addDelegate('grepTotal');
  addDelegate('suite');
  addDelegate('total');

  function addDelegate(prop) {
    shim.__defineGetter__(prop, function() {
      var property = runner[prop];
      if (typeof property === 'function') {
        property = property.bind(runner);
      }
      return property;
    });
  }

  var delegatedEvents = {};

  shim.on('newListener', function(event) {

    if (event in delegatedEvents) return;

    delegatedEvents[event] = true;
    debug("Shim: Delegating '%s'", event);

    runner.on(event, function() {
      var eventArgs = Array.prototype.slice.call(arguments, 0);
      eventArgs.unshift(event);

      withReplacedStdout(stream, function() {
        shim.emit.apply(shim, eventArgs)
      })

    })

  })

  return shim;
}

function withReplacedStdout(stream, func) {
  if (!stream) {
    return func();
  }

  // The hackiest of hacks
  debug('Replacing stdout');

  var stdoutGetter = Object.getOwnPropertyDescriptor(process, 'stdout').get;
  var stderrGetter = Object.getOwnPropertyDescriptor(process, 'stderr').get;

  console._stdout = stream;
  console._stderr = stream;
  process.__defineGetter__('stdout', function() { return stream });
  process.__defineGetter__('stderr', function() { return stream });

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
