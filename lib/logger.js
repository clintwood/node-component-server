// Deps
var fmt = require('util').format

/*
 * Logger object
 */
var Logger = exports = module.exports = function Logger(loglevel, stream) {
  if ('string' == typeof loglevel) loglevel = exports[loglevel.toUpperCase()];
  this.level = loglevel || exports.DEBUG;
  this.stream = stream || process.stdout;
}

/**
 * Logging Levels.
 * @type Number
 */
exports.EMERGENCY = 0;
exports.CRITICAL  = 1;
exports.ERROR     = 2;
exports.WARNING   = 3;
exports.INFO      = 4;
exports.DEBUG     = 5;

/*
 * implementation
 */
Logger.prototype = {

  log: function(levelStr, args) {
    var date = new Date();
    if (exports[levelStr] <= this.level) {
      this.stream.write('[' + 
        date.toISOString().substr(0, 10) + ' ' +
        date.toTimeString().substr(0, 8) + '.' +
        ('000' + date.getMilliseconds()).slice(-3) + '] ' +
        levelStr + ' - ' +
        fmt.apply(this, args) + '\n');
    }
  },

  emergency: function(msg) {
    this.log('EMERGENCY', arguments);
  },
  critical: function(msg) {
    this.log('CRITICAL', arguments);
  },
  error: function(msg) {
    this.log('ERROR', arguments);
  },
  warn: function(msg) {
    this.log('WARNING', arguments);
  },
  info: function(msg) {
    this.log('INFO', arguments);
  },
  debug: function(msg) {
    this.log('DEBUG', arguments);
  }
}