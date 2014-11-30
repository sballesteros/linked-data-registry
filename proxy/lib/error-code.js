module.exports = function errorCode(msg, code) {
  if (typeof msg === 'object') {
    msg = msg.reason || msg.error || 'error';
  }

  var err = new Error(msg);
  err.code = code;
  return err;
};
