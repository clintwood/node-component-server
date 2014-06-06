/**
 * Dependencies
 */

 module.exports.canCompress = canCompress;
 module.exports.padZero = padZero;

 function canCompress(req) {
  var ae = req.header('accept-encoding');
  return (ae && ~~ae.indexOf('gzip'));
}

function padZero(n) {
  return ((n < 10) ? '0' : '') + n;
}

