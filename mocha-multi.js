var fs = require('fs');
var util = require('util');
var debug = require('debug')('mocha:multi');

module.exports = MochaMulti

// HAAAACK - attempt to trick node into waiting for the streams to finish
var exit = process.exit;
process.exit = function(code) {
  var quit = exit.bind(process, code);
  process.on('exit', quit);
}

function MochaMulti(runner) {
  initReporters(runner, parseSetup());
}

var msgs = {
  no_definitions: "reporter definitions must be passed via stdin\n\
eg. echo dot=- xunit=file.xml | mocha",
  invalid_definition: "'%s' is an invalid definition\n\
expected <reporter>=<destination>",
  invalid_reporter: "Unable to find '%s' reporter"
}
function bombOut(id) {
  var args = Array.prototype.slice.call(arguments, 0);
  args[0] = 'ERROR: ' + msgs[id];
  console.warn.apply(console, args);
  process.exit(1);
}

function parseSetup() {
  var reporterDefs = readStdin().trim().split(/\s/).filter(identity);
  if (!reporterDefs.length) {
    bombOut('no_definitions');
  }
  debug("Got reporter defs: %j", reporterDefs);
  return reporterDefs.map(parseReporter);
}

function readStdin() {
  // Hackily read stdin - assume 1k is enough
  var buffer = new Buffer(1024), bytesRead;
  try {
    bytesRead = fs.readSync(process.stdin.fd, buffer, 0, 1024);
    return buffer.toString('utf8', 0, bytesRead);
  } catch (err) {
    return '';
  }
}

function parseReporter(definition) {
  var pair = definition.split('=');
  if (pair.length != 2) {
    bombOut('invalid_definition', definition);
  }
  return pair;
}

function initReporters(runner, setup) {
  setup.forEach(function(definition) {

    debug("Initialising reporter '%s' to '%s'", definition[0], definition[1]);

    var stream = resolveStream(definition[1]);
    var shim = createRunnerShim(runner, stream);

    debug("Shimming runner into reporter '%s'", definition[0]);

    withReplacedStdout(stream, function() {
      var Reporter = resolveReporter(definition[0]);
      return new Reporter(shim);
    })

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
      return runner[prop];
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

  var stdout = process.stdout;
  var stderr = process.stderr;
  var stdoutGetter = Object.getOwnPropertyDescriptor(process, 'stdout').get;
  var stderrGetter = Object.getOwnPropertyDescriptor(process, 'stderr').get;

  console._stdout = stream;
  console._stderr = stream;
  process.__defineGetter__('stdout', function() { return stream });
  process.__defineGetter__('stderr', function() { return stream });

  try {
    func();
  } finally {

    debug('Restoring stdout');
    console._stdout = stdout;
    console._stderr = stderr;
    process.__defineGetter__('stdout', stdoutGetter);
    process.__defineGetter__('stderr', stderrGetter);
  }
}

function identity(x) {
  return x;
}
