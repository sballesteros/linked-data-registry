var router = require('express').Router({caseSensitive: true}),
    SchemaOrgIo = require('schema-org-io'),
    crypto = require('crypto'),
    request = require('request'),
    errorCode = require('../lib/error-code'),
    bodyParser = require('body-parser');

var jsonParser = bodyParser.json({limit: '1mb'});

var forceAuth = require('../middlewares/force-auth'),
    compact = require('../middlewares/compact');

router.put('/:name', jsonParser, compact, function(req, res, next) {
  var cdoc = req.cdoc;

  var name = cdoc['@id'] && cdoc['@id'].split('ldr:users/')[1];

  if (name !== req.params.name) {
    return next(errorCode('not allowed', 403));
  }

  var email = cdoc.email && cdoc.email.split('mailto:')[1];
  if (!email) {
    return next(errorCode('invalid mailto: URL', 422));
  }

  if (!cdoc.password) {
    return next(errorCode('password is missing', 422));
  }

  var userdata = { '@id':  'ldr:users/' + req.params.name };
  if (cdoc['@type']) userdata['@type'] = cdoc['@type'];

  userdata.name = req.params.name;
  userdata.email = email;

  if (~req.app.get('ROOT_COUCH').indexOf('cloudant')) {
    var salt = crypto.randomBytes(30).toString('hex');
    userdata.salt = salt;
    userdata.password_sha = crypto.createHash("sha1").update(cdoc.password + salt).digest('hex');
  } else {
    userdata.password = cdoc.password;
  }

  //add other properties
  for (var key in cdoc) {
    if (!(key in userdata) && key.charAt(0)!== '_' && key !== 'date' && key !== 'startDate' && key !== 'roles') {
      userdata[key] = cdoc[key];
    }
  }
  userdata.startDate = (new Date()).toISOString();

  request.put({url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') +  'create/org.couchdb.user:' + req.params.name, json: userdata}, function(err, resp, body) {
    if (err) return next(err);

    if (resp.statusCode === 201) {
      body = {
        '@context': SchemaOrgIo.contextUrl,
        "@type": "RegisterAction",
        "actionStatus": "CompletedActionStatus",
        "agent": 'ldr:users/' + req.params.name,
        "object": 'ldr:'
      };
      return res.type('application/ld+json').status(resp.statusCode).json(body);
    } else {
      return next(errorCode(body, resp.statusCode));
    }
  });
});


router.get('/:name', function(req, res, next) {

  request.get({url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'user/org.couchdb.user:' + req.params.name, json:true}, function(err, resp, body) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));

    res.type('application/ld+json').status(resp.statusCode).json(body);
  });

});


router['delete']('/:name', forceAuth, function(req, res, next) {

  if (req.user.name !== req.params.name) {
    return next(errorCode('not allowed', 403));
  }

  var iri = req.app.get('ROOT_COUCH_ADMIN_USERS') + 'org.couchdb.user:' + req.params.name;

  request.head(iri, function(err, resp) {
    if (err) return next(err);
    if (resp.statusCode >= 400) {
      return res.status(resp.statusCode).json({error: (resp.statusCode === 404)? 'user not found' : ('could not DELETE ' + req.user.name)});
    };
    var etag = resp.headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes
    request.del({url: iri, headers: {'If-Match': etag}, json:true}, function(err, resp, body) {
      if (err) return next(err);
      if (resp.statusCode === 200) {
        body = {
          '@context': SchemaOrgIo.contextUrl,
          "@type": "UnRegisterAction",
          "actionStatus": "CompletedActionStatus",
          "agent": { "name": req.user.name },
          "object": "ldr:"
        };
        return res.type('application/ld+json').status(resp.statusCode).json(body);
      } else {
        return next(errorCode(body, resp.statusCode));
      }
    });
  });

});



module.exports = router;
