module.exports = function(req, res, next) {
  if(req.secure) {
    req.proxyUrl = 'https://' + req.app.get('NODE_HOST')  + ((req.app.get('NODE_PORT_HTTPS') != 443) ? (':' + req.app.get('NODE_PORT_HTTPS')) : '');
  } else {
    req.proxyUrl = 'http://' + req.app.get('NODE_HOST')  + ((req.app.get('NODE_PORT_HTTP') != 80) ? (':' + req.app.get('NODE_PORT_HTTP')) : '');
  }
  next();
};
