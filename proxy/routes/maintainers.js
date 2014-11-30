var router = require('express').Router({caseSensitive: true}),
    request = require('request'),
    SchemaOrgIo = require('schema-org-io'),
    errorCode = require('../lib/error-code'),
    bodyParser = require('body-parser');

var jsonParser = bodyParser.json({limit: '1mb'});

var forceAuth = require('../middlewares/force-auth');

router.get('/ls/:id', function(req, res, next) {
  request.get({
    url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'doc/' + req.params.id,
    json: true
  }, function(err, resp, body) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));

    var doc = {
      '@context': SchemaOrgIo.contextUrl,
      '@id': req.params.id,
      'accountablePerson': body.map(function(x) {
        var person = {
          '@id': 'ldr:users/' + x.name,
          '@type': 'Person',
          email: 'mailto:' + x.email
        };
        ['givenName', 'familyName'].forEach(function(p) {
          if (x[p]) {
            person[p] = x[p];
          }
        });
        return person;
      })
    };

    res
      .type('application/ld+json')
      .status(resp.statusCode)
      .json(doc);
  });
});

router.post('/add/:username/:id', jsonParser, forceAuth, function(req, res, next) {
  //check if data.username (the user granted) is an existing user
  request.head(req.app.get('ROOT_COUCH_ADMIN_USERS') + 'org.couchdb.user:' + req.params.username, function(err, resp) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode('granted user does not exists', resp.statusCode));

    //check if req.user.name (the granter) is a maintainer of req.params.id
    request.get({
      url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'maintains/org.couchdb.user:' + req.user.name,
      json:true
    }, function(err, resp, maintains) {
      if (err) return next(err);
      if (resp.statusCode >= 400) return next(errorCode(maintains, resp.statusCode));

      if (maintains.indexOf(req.params.id) === -1) {
        return next(errorCode('not allowed', 403));
      }

      request.put({
        url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'add/org.couchdb.user:' + req.params.username,
        json: {namespace: req.params.id, permissions: 'w'}
      }, function(err, resp, body) {
        if (err) return next(err);

        if (res.statusCode === 200 || res.statusCode === 201) {
          body = {
            '@context': SchemaOrgIo.contextUrl,
            '@type': 'GiveAction',
            'actionStatus': 'CompletedActionStatus',
            'agent': 'ldr:users/' + req.user.name,
            'object': 'ldr:' + req.params.id,
            'recipient': 'ldr:users/' + req.params.username
          };
          res.type('application/ld+json').status(resp.statusCode).json(body);
        } else {
          next(errorCode(body, resp.statusCode));
        }
      });
    });
  });
});

/**
 * TODO do something (or not?) if a package has no maintainers ??
 */
router.post('/rm/:username/:id', jsonParser, forceAuth, function(req, res, next) {
  //check if req.user.name (the granter) is a maintainer of req.params.id
  request.get({
    url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'maintains/org.couchdb.user:' + req.user.name,
    json:true
  }, function(err, resp, maintains) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(maintains, resp.statusCode));

    if (maintains.indexOf(req.params.id) === -1) {
      return next(errorCode('not allowed', 403));
    }

    request.put({
      url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'rm/org.couchdb.user:' + req.params.username,
      json: {namespace: req.params.id, permissions: 'w'}
    }, function(err, resp, body) {
      if (err) return next(err);
      if (res.statusCode === 200 || res.statusCode === 201) {
        body = {
          '@context': SchemaOrgIo.contextUrl,
          '@type': 'TakeAction',
          'actionStatus': 'CompletedActionStatus',
          'agent': 'ldr:users/' + req.user.name,
          'object': 'ldr:' + req.params.id,
          'recipient': 'ldr:users/' + req.params.username
        };
        res.type('application/ld+json').status(resp.statusCode).json(body);
      } else {
        next(errorCode(body, resp.statusCode));
      }
    });
  });
});


module.exports = router;
