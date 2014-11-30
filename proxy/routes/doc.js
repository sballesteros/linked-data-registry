var router = require('express').Router({caseSensitive: true}),
    request = require('request'),
    SchemaOrgIo = require('schema-org-io'),
    async = require('async'),
    semver = require('semver'),
    cookie = require('cookie'),
    bodyParser = require('body-parser'),
    errorCode = require('../lib/error-code'),
    s3util = require('../lib/s3util');

var jsonParser = bodyParser.json({limit: '1mb'});

var forceAuth = require('../middlewares/force-auth'),
    compact = require('../middlewares/compact'),
    validate = require('../middlewares/validate'),
    maxSatisfyingVersion = require('../middlewares/max-satisfying-version'),
    serveJsonld = require('../middlewares/serve-jsonld');

//TODO use REDIS and create a lock to validate that all the non
//namespaced parts exists in the registry (if so => links) if not =>
//invalid part @id (should be namespace/partId)
router.put('/:id', forceAuth, jsonParser, compact, validate, function(req, res, next) {

  if (!('content-length' in req.headers)) {
    return next(errorCode('Length Required', 411));
  }
  if (parseInt(req.headers['content-length'], 10) > 16777216) {
    return next(errorCode('Request Entity Too Large, currently accept only package < 16Mo', 413));
  }

  var cdoc = req.cdoc;
  var _id = cdoc['@id'].split(':')[1];
  if (_id !== req.params.id) {
    return next(errorCode('not allowed', 403));
  }
  if ('version' in cdoc) {
    _id = encodeURIComponent(_id + '@' + cdoc.version);
  }

  //is there previous version/revision
  request.get({url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'latestview/' + req.params.id, json: true}, function(err, resp, bodyView) {
    if (err) return next(err);
    var ropts = {
      url: req.app.get('ROOT_COUCH_REGISTRY') +  _id,
      headers: { 'X-CouchDB-WWW-Authenticate': 'Cookie', 'Cookie': cookie.serialize('AuthSession', req.user.token) },
      json: cdoc
    };

    if (!bodyView.rows.length) { //first time ever we publish the document: add username to maintainers of the pkg
      cdoc.latest = true; //add latest tag Note: **never** rely on the `latest` tag to retrieve latest version, use views instead. the `latest` tag is used to simplify search indexes
      //add username to maintainers of the doc first (if not validate_doc_update will prevent the submission)
      var udoc = { namespace: req.params.id, permissions: 'w' };
      request.put({
        url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') +  'add/org.couchdb.user:' + req.user.name,
        json: udoc
      }, function(err, respAdd, bodyAdd) {
        if(err) return next(err);

        if (respAdd.statusCode >= 400 && respAdd.statusCode != 409) { //if 409: can be simultaneous call to the update function we keep going
          return next(errorCode('PUT /:id aborted: could not add ' + req.user.name + ' as a maintainer ' + bodyAdd.error, respAdd.statusCode));
        }

        //store the doc
        request.put(ropts, function(errCouch, respCouch, bodyCouch) {
          if (errCouch || (respCouch.statusCode >= 400 && respCouch.statusCode !== 409)) { //if 409 we still need a maintainer
            request.put({
              url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') +  'rm/org.couchdb.user:' + req.user.name,
              json: udoc
            }, function(err, respRm, bodRm) {
              if (err) console.error(err);
            });

            if (errCouch) {
              return next(errCouch);
            } else {
              return next(errorCode('PUT /:id aborted ' + bodyCouch.reason, respCouch.statusCode));
            }
          }

          _next(req, res, cdoc, true, bodyCouch, respCouch.statusCode);
        });

      });

    } else { //version or document update

      var wasVersioned = !! ('version' in bodyView.rows[0].value);
      var isVersioned = !! ('version' in cdoc);

      //TODO do we really want to do that ?
      if (isVersioned !== wasVersioned) {
        var errMsg = (isVersioned) ? 'Before this update the document was not versioned. Delete the document to be able to PUT a versioned one' :
          'Before this update the document was versioned. Delete all previous version of the document to be able to PUT a non versioned one';
        return res.status(400).json({ error: errMsg});
      }

      if (isVersioned) {
        var latestVersion = bodyView.rows[0].value.version;
        if (semver.valid(cdoc.version) && semver.valid(latestVersion)) {
          if (semver.gt(cdoc.version, latestVersion)) {
            cdoc.latest = true;
          }
        } else {
          if (cdoc.version > latestVersion) {
            cdoc.latest = true;
          }
        }
      } else {
        ropts.url = req.app.get('ROOT_COUCH_REGISTRY_RW') + 'update/' + _id; //<-call update handler to save a HEAD to get the _rev
        cdoc.latest = true;
      }

      request.put(ropts, function(err, resp, body) {
        if (err) return next(err);
        if (resp.statusCode >= 400) {
          return next(errorCode(body, resp.statusCode));
        }

        if (isVersioned && cdoc.latest) { //remove previous latest tag (or tags if something went wrong at some point before...)
          request.get({url: req.app.get('ROOT_COUCH_ADMIN_REGISTRY_RW') + 'vtag/' + req.params.id, json:true}, function(errTagged, respTagged, bodyTagged) {
            // if error we keep going, will be fixed at the next update..
            if (errTagged) { console.error(errTagged) };
            if (respTagged.statusCode >= 400) { console.error(errorCode(bodyTagged, respTagged.statusCode)) };

            var previousTags = bodyTagged.rows.filter(function(x) {return x.value.version !== cdoc.version;});
            async.each(previousTags, function(tag, cb) {
              request.put({url: req.app.get('ROOT_COUCH_ADMIN_REGISTRY_RW') + 'rmvtag/' + encodeURIComponent(tag.value._id), json:true}, function(err, resp, body) {
                if (err) { console.error(err) };
                if (resp.statusCode >= 400) { console.error(errorCode(body, resp.statusCode)) };
                cb(null);
              });
            }, function(err) {
              if (err) console.error(err);
              _next(req, res, cdoc, false, body, resp.statusCode);
            });

          });
        } else {
          _next(req, res, cdoc, false, body, resp.statusCode);
        }
      });

    }
  });

  function _next(req, res, cdoc, isNew, body, statusCode) {
    if (statusCode === 200 || statusCode === 201) {
      var action =  {
        "@context": SchemaOrgIo.contextUrl,
        "@type": (isNew)? "CreateAction": "UpdateAction",
        "actionStatus": "CompletedActionStatus",
        "agent": 'ldr:users/' + req.user.name,
        "result": 'ldr:' + req.params.id + (('version' in body) ? ('?version=' + body.version) : '')
      };
      res.type('application/ld+json').status(201).json(action);
    } else {
      next(errorCode(body, statusCode));
    }
  };

});

router['delete']('/:id/:version?', forceAuth, function(req, res, next) {
  var version = req.params.version || req.query.version;

  async.waterfall([
    function(cb) { //get (all) the versions
      if (version) return cb(null, [encodeURIComponent(req.params.id + '@' + version)]);
      request.get({url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'all/' + req.params.id, json:true}, function(err, resp, body) {
        if (err) return cb(err);
        if (resp.statusCode >= 400) {
          return cb(errorCode(body, resp.statusCode));
        }

        var _idList = body.rows.map(function(row) {
          if ('version' in row.value) {
            return encodeURIComponent(row.value['@id'].split(':')[1] + '@' + row.value.version);
          } else {
            return row.value['@id'].split(':')[1];
          }
        });

        if(!_idList.length) {
          return cb(errorCode('not found', 404));
        }
        cb(null, _idList);
      });
    },
    function(_idList, cb) { //delete (all) the versions and the associated resources on S3
      async.each(_idList, function(_id, cb2) {
        //get the doc so that we have it to get the resource to remove from S3 (by the time we delete S3 objects, the doc will have been deleted)
        request.get({ url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'show/' + _id, json:true }, function(err, resp, cdoc) {
          if (err) return cb2(err);
          if (resp.statusCode >= 400) return cb2(errorCode('could not GET ' + _id, resp.statusCode));
          //delete the doc on the registry
          request.head(req.app.get('ROOT_COUCH_REGISTRY') + _id, function(err, resp) {
            if (err) return cb2(err);
            if (resp.statusCode >= 400) return cb2(errorCode('could not HEAD ' + _id, resp.statusCode));
            request.del({
              url: req.app.get('ROOT_COUCH_REGISTRY') + _id,
              headers: {
                'X-CouchDB-WWW-Authenticate': 'Cookie',
                'Cookie': cookie.serialize('AuthSession', req.user.token),
                'If-Match': resp.headers.etag.replace(/^"(.*)"$/, '$1'),
                json: true
              }
            }, function(err, resp, body) {
              if (err) return cb2(err);
              if (resp.statusCode >= 400) return cb2(errorCode(body, resp.statusCode));
              s3util.deleteObjects(req.app.get('s3'), cdoc, req.app.get('ROOT_COUCH_REGISTRY_RW'), function(err) {
                if (err) console.error(err);
                cb2(null);
              });
            });
          });
        });
      }, function(err) {
        if (err) return cb(err);
        cb(null, req.params.id);
      });
    }
  ], function(err, id) { //remove maintainers if all version of the doc have been deleted
    if (err) return next(err);

    request.get({
      url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'all',
      qs: {key: '"' + id + '"'},
      json:true
    }, function(err, resp, body) {
      if (err) return next(err);
      if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));

      if (body.rows.length) { //still versions of :id to maintains, we are done
        res.json({ok: true});
      } else { //no more version of :id remove all the maintainers
        request.get({
          url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'doc/' + id,
          json: true
        }, function(err, resp, maintainers) {
          if (err) return next(err);
          if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));
          async.each(maintainers, function(maintainer, cb) {
            request.put({
              url: req.app.get('ROOT_COUCH_ADMIN_USERS_RW') + 'rm/org.couchdb.user:' + maintainer.name,
              json: {namespace: id, permissions: 'rw'}
            }, function(err, resp, body) {
              if (err) return cb(err);
              if (resp.statusCode >= 400) return cb(errorCode(body, resp.statusCode));
              cb(null);
            });
          }, function(err) {
            if(err) return next(err);
            res
              .type('application/ld+json')
              .json({
                '@context': SchemaOrgIo.contextUrl,
                '@type': 'DeleteAction',
                'actionStatus': 'CompletedActionStatus',
                'agent': 'ldr:users/' + req.user.name,
                'object': 'ldr:' + req.params.id + '/' + ((version) ? ('?version=' + version) : '')
              });
          });
        });
      }
    });
  });

});


/**
 * range can be specified with query string parameter `version`
 */
router.get('/:id/:part*?', maxSatisfyingVersion, function(req, res, next) {

  var partId;
  if (req.params.part) {
    partId = req.url.replace(/^\/|\/$/g, '').split('/').slice(1).join('/');
    if (partId === decodeURIComponent(partId)) {
      partId = encodeURIComponent(partId);
    }
  }

  var uri;
  if (req.version) { //<-thanks to maxSatisfyingVersion middleware
    uri = req.app.get('ROOT_COUCH_REGISTRY_RW') + 'show/' + encodeURIComponent(req.params.id + '@' + req.version);
  } else { // <- we want the latest version
    uri = req.app.get('ROOT_COUCH_REGISTRY_RW') + 'latest/' + req.params.id;
  }

  if (partId) {
    uri += '/' + partId;
  }

  request.get({url: uri, json: true}, function(err, resp, cdoc) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(cdoc, resp.statusCode));
    req.cdoc = cdoc;
    next();
  });

}, serveJsonld);


module.exports = router;
