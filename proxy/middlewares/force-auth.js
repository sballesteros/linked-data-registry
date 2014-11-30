var cookie = require('cookie'),
    request = require('request'),
    errorCode = require('../lib/error-code'),
    auth = require('basic-auth');

module.exports = function forceAuth(req, res, next) {
  var user = auth(req);
  if (!user) {
    return res.status(401).json({'error': 'Unauthorized'});
  }

  request.post({
    url: req.app.get('ROOT_COUCH') + '_session',
    form: {name: user.name, password: user.pass},
    header: {'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'}
  }, function(err, resp, body) {
    if (err) return next(err);
    if (resp.statusCode >= 400) {
      return next(errorCode(JSON.parse(body).reason, resp.statusCode));
    }

    if (resp.headers && resp.headers['set-cookie']) {
      try {
        var token = cookie.parse(resp.headers['set-cookie'][0])['AuthSession'];
      } catch(e) {
        return next(new Error('no cookie for auth: ' + e.message));
      }
      req.user = { name: user.name, token: token };
      next();
    } else {
      res.status(403).json({'error': 'Forbidden'});
    }
  });

};
