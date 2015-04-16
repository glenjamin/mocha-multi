var fs = require('fs');
var util = require('util');
var debug = require('debug')('mocha:multi');

// Let mocha decide about tty early
require('mocha/lib/reporters/base');

module.exports = MochaMulti

// Make sure we don't lose these!
var stdout = process.stdout;
var stderr = process.stderr;

// Should we hijack process.exit to wait for streams to close?
var shouldExit = false;

// HAAAACK
// if mocha is being run as commandline program
// force mocha to call our fake process.exit
//
// This has to happen on require to be early
// enough to affect the code in _mocha
try {
  var program = require('mocha/node_modules/commander');
  if (program.name == 'mocha' && ('exit' in program)) {
    shouldExit = program.exit;
    program.exit = true;
  }
} catch (ex) {}

// Capture the exit code and preserve it
var exit = process.exit;
process.exit = function(code) {
  var quit = exit.bind(process, code);
  process.on('exit', quit);
}

function MochaMulti(runner, options) {
  var setup;
  if( Object.keys(options.reporterOptions).length > 0 ) {
    debug("options %j %j", options, options.reporterOptions);
    setup=[];
    var reporters=Object.keys(options.reporterOptions);
    reporters.forEach(function(reporter) {
      debug("adding reporter %j %j", options.reporterOptions, reporter);
      setup.push([ reporter, options.reporterOptions[reporter].stdout, options.reporterOptions[reporter].options ]);
    });
  } else {
    setup=parseSetup();
  }
  debug("setup %j", setup);
  var streams = initReportersAndStreams(runner, setup);
  // Remove nulls
  streams = streams.filter(identity);

  if (!shouldExit) {
    debug('not hijacking exit')
    return;
  }

  // Wait for streams, then exit
  runner.on('end', function() {
    debug('Shutting down...')

    var num = streams.length;
    streams.forEach(function(stream) {
      stream.end(function() {
        num -= 1;
        onClose();
      });
    });
    onClose();

    function onClose() {
      if (num === 0) {
        if (! program.watch) {
          debug('Exiting.');
          exit();
        }
      }
    }
  })
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
  exit(1);
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
