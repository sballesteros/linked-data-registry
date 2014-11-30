var router = require('express').Router({caseSensitive: true}),
    SchemaOrgIo = require('schema-org-io'),
    errorCode = require('../lib/error-code');

var forceAuth = require('../middlewares/force-auth');

router.get('/', forceAuth, function(req, res, next) {
  if (req.user) {
    res.type('application/ld+json').json({
      '@context': SchemaOrgIo.contextUrl,
      '@id': 'ldr:users/' + req.user.name,
      'token': req.user.token
    });
  } else {
    return next(errorCode('/session', 500));
  }
});

module.exports = router;
