var http = require('http')
  , https = require('https')
  , util = require('util')
  , semver = require('semver')
  , fs = require('fs')
  , path = require('path')
  , express = require('express')
  , querystring = require('querystring')
  , auth = require('basic-auth')
  , cookie = require('cookie')
  , request = require('request')
  , crypto = require('crypto')
  , async = require('async')
  , mime = require('mime')
  , url = require('url')
  , jsonld = require('jsonld')
  , Packager = require('package-jsonld')
  , clone = require('clone')
  , AWS = require('aws-sdk')
  , sha = require('sha')
  , s3util = require('./lib/s3util')
  , bodyParser = require('body-parser')
  , concat = require('concat-stream')
  , pkgJson = require('../package.json');

request = request.defaults({headers: {'Accept': 'application/json'}});

mime.define({
  'application/ld+json': ['jsonld'],
  'application/x-ldjson': ['ldjson', 'ldj'],
  'application/x-gzip': ['gz', 'gzip'] //tar.gz won't work
});

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standard-analytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});

var credentials = {
  key: fs.readFileSync(path.join($HOME, 'certificate', 'standardanalytics.key')),
  cert: fs.readFileSync(path.join($HOME, 'certificate', 'certificate-47444.crt')),
  ca: fs.readFileSync(path.join($HOME, 'certificate', 'GandiStandardSSLCA.pem'))
};

var app = express()
  , httpServer = http.createServer(app)
  , httpsServer = https.createServer(credentials, app);

app.enable('case sensitive routing');

var couch = {
  ssl: process.env['COUCH_SSL'],
  host: process.env['COUCH_HOST'],
  port: process.env['COUCH_PORT'],
  registry: (process.env['REGISTRY_DB_NAME'] || 'registry'),
  interaction: (process.env['INTERACTION_DB_NAME'] || 'interaction')
};

var admin = { name: process.env['COUCH_USER'], password: process.env['COUCH_PASS'] }
  , host = process.env['NODE_HOST']
  , port = process.env['NODE_PORT'] || 80
  , portHttps = process.env['NODE_PORT_HTTPS'] || 443;

var rootCouch = util.format('%s://%s:%s/', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port)
  , rootCouchAdmin = util.format('%s://%s:%s@%s:%d/', (couch.ssl == 1) ? 'https': 'http', admin.name, admin.password, couch.host, couch.port)
  , rootCouchAdminUsers = rootCouchAdmin + '_users/'
  , rootCouchAdminUsersRw = rootCouchAdminUsers + '_design/maintainers/_rewrite/'
  , rootCouchRegistry = util.format('%s://%s:%s/%s/', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port, couch.registry)
  , rootCouchAdminRegistry = rootCouchAdmin + couch.registry + '/'
  , rootCouchRegistryRw = rootCouchRegistry + '_design/registry/_rewrite/'
  , rootCouchAdminRegistryRw = rootCouchAdminRegistry + '_design/registry/_rewrite/';

var packager = new Packager();

app.set('packager', packager);
app.set('admin', admin);
app.set('rootCouch', rootCouch);
app.set('rootCouchAdmin', rootCouchAdmin);
app.set('rootCouchAdminUsers', rootCouchAdminUsers);
app.set('rootCouchAdminUsersRw', rootCouchAdminUsersRw);
app.set('rootCouchRegistry', rootCouchRegistry);
app.set('rootCouchAdminRegistry', rootCouchAdminRegistry);
app.set('rootCouchRegistryRw', rootCouchRegistryRw);
app.set('rootCouchAdminRegistryRw', rootCouchAdminRegistryRw);

app.use(function(req, res, next){
  if(req.secure){
    req.proxyUrl = 'https://' + host  + ((portHttps != 443) ? (':' + portHttps) : '');
  } else {
    req.proxyUrl = 'http://' + host  + ((port != 80) ? (':' + port) : '');
  }
  next();
});


var jsonParser = bodyParser.json();

function forceAuth(req, res, next){

  var user = auth(req);
  if (!user) {
    return res.status(401).json({'error': 'Unauthorized'});
  }

  request.post({url: rootCouch + '_session', json: {name: user.name, password: user.pass} }, function(err, resp, body){
    if (err) return next(err);
    if (resp.statusCode >= 400) {
      return next(errorCode(body, resp.statusCode))
    }

    if (resp.headers && resp.headers['set-cookie']) {
      try {
        var token = cookie.parse(resp.headers['set-cookie'][0])['AuthSession'];
      } catch(e){
        return next(new Error('no cookie for auth: ' + e.message));
      }
      req.user = { name: user.name, token: token };
      next();
    } else {
      res.status(403).json({'error': 'Forbidden'});
    }
  });

};


/**
 * see http://json-ld.org/spec/latest/json-ld/#iana-considerations
 */
function serveJsonld(req, res, next){
  var cdoc = req.cdoc;

  var ctxUrl = req.proxyUrl + '/context.jsonld'; //to facilitate testing on localhost !!TODO find a better way...: might have side effect
  var ctx;
  if (cdoc['@context'] === Packager.contextUrl) {//context transfo to help for testing
    ctx = cdoc['@context'];
    cdoc['@context'] = ctxUrl;
  }

  function _next(err, pdoc) {
    if (err) return next(err);

    //reverse @context transfo
    if (ctx && pdoc['@context'] === ctxUrl) {
      pdoc['@context'] = ctx;
    }

    res.json(pdoc);
  };


  switch(req.accepts('application/json', 'application/ld+json', 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"', 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"', 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"')){

  case 'application/json':
    res.set('Link', Packager.contextLink);
    delete cdoc['@context'];
    res.json(cdoc);
    break;

  case 'application/ld+json':
    _next(null, cdoc);
    break;

  case 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"':
    _next(null, cdoc);
    break;

  case 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"':
    jsonld.expand(cdoc, {expandContext: ctxUrl}, _next);
    break;

  case 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"':
    jsonld.flatten(cdoc, ctxUrl, _next);
    break;

  default:
    res.status(406).json({'error': 'Not Acceptable'});
    break;
  };

};

function compactAndValidate(req, res, next){
  var doc = req.body;
  var ctxUrl = req.proxyUrl + '/context.jsonld'; //to facilitate testing on localhost

  var ctx;
  if (doc['@context'] === Packager.contextUrl) {
    ctx = doc['@context'];
    doc['@context'] = ctxUrl;
  }

  jsonld.compact(doc, ctxUrl, function(err, cdoc){
    if(err) return next(err);

    try {
      packager.validate(cdoc, ctxUrl);
    } catch (e) {
      return next(e);
    }

    if (ctx && cdoc['@context'] === ctxUrl) {
      cdoc['@context'] = ctx;
    }

    req.cdoc = cdoc;
    next();
  });
};

function maxSatisfyingVersion(req, res, next){

  var q = req.query || {};

  if (! ('version' in q)) {
    return next();
  }

  //handle range query
  var id = req.params.id.split('@')[0];

  //get all the versions of the pkg
  request.get({url: rootCouchRegistryRw + 'all/' + id, json: true}, function(err, resp, body){
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errCode(body, resp.statusCode));

    if (!body.rows.length) { //<- no versions
      next();
    }

    var versions = body.rows
      .filter(function(row){
        return ('version' in row.value);
      })
      .map(function(row){
        return row.value.version;
      });

    if (!versions.length){
      return next(errorCode('no version could be find for the document', 404));
    }

    var version;
    var isSemver = versions.every(function(v){ return semver.valid(v); });
    if (isSemver) {
      version = semver.maxSatisfying(versions, q.version);
    } else { //sort lexicographicaly
      version = versions.sort().reverse()[0];
    }

    if (!version) {
      return next(errorCode('no version could satisfy the range ' + q.version, 404));
    }

    req.version = version;

    next();
  });

};


app.get('/context.jsonld', function(req, res, next){
  res.set('Content-Type', 'application/ld+json');
  res.send(JSON.stringify(Packager.context(), null, 2));
});


app.get('/session', forceAuth, function(req, res, next){
  if (req.user) {
    res.json(req.user);
  } else {
    return next(errorCode('/session', 500));
  }
});


app.put('/adduser/:name', jsonParser, function(req, res, next){
  var doc = req.body;

  if (doc.name !== req.params.name) {
    return next(errorCode('not allowed', 403));
  }

  request.put({url: rootCouchAdminUsersRw +  'create/org.couchdb.user:' + req.params.name, json: doc}, function(err, resp, body){
    if (err) return next(err);
    res.status(resp.statusCode).json(body);
  });
});


app.put('/r/:sha1', forceAuth, function(req, res, next){

  //check if the resource exists already
  s3.headObject({Key:req.params.sha1}, function(err, s3Headers) {
    if (!err) {
      if (s3Headers.ContentLength) { res.set('Content-Length', s3Headers.ContentLength); }
      if (s3Headers.ContentType) { res.set('Content-Type', s3Headers.ContentType); }
      if (s3Headers.ContentEncoding) { res.set('Content-Encoding', s3Headers.ContentEncoding); }
      if (s3Headers.ETag) { res.set('ETag', s3Headers.ETag); }
      if (s3Headers.LastModified) { res.set('Last-Modified', s3Headers.LastModified); }

      return res.status(200).json({ok:true});
    }

    //resource is not on S3, we PUT it
    if (!req.headers['content-md5']) {
      return res.status(400).json({error: 'a Content-MD5 header must be provided'});
    }

    var checkStream = req.pipe(sha.stream(req.params.sha1));
    var checkErr = null;

    checkStream.on('error', function(err){
      checkErr = err;
    });

    var opts = {
      Key: req.params.sha1,
      Body: checkStream,
      ContentType: req.headers['content-type'],
      ContentLength: parseInt(req.headers['content-length'], 10),
      ContentMD5: req.headers['content-md5']
    };

    if (req.headers['content-encoding']) {
      opts['ContentEncoding'] = req.headers['content-encoding']
    }

    s3.putObject(opts, function(err, data){
      if (err) return next(err);
      if (checkErr) {
        s3.deleteObject({Key: req.params.sha1}, function(err, data) {
          if (err) console.error(err);
          return next(checkErr);
        });
      } else {
        res.set('ETag', data.ETag);
        res.json(data);
      }
    });

  });

});


/**
 * TODO: redirect instead ?
 * TODO: find a way to use Content-Disposition: attachment; filename=FILENAME to indicate filename...
 */
app.get('/r/:sha1', function(req, res, next){

  s3.headObject({Key:req.params.sha1}, function(err, s3Headers) {
    if (err) return next(errorCode(err.code, err.statusCode));

    if (s3Headers.ContentLength) { res.set('Content-Length', s3Headers.ContentLength); }
    if (s3Headers.ContentType) { res.set('Content-Type', s3Headers.ContentType); }
    if (s3Headers.ContentEncoding) { res.set('Content-Encoding', s3Headers.ContentEncoding); }
    if (s3Headers.ETag) { res.set('ETag', s3Headers.ETag); }
    if (s3Headers.LastModified) { res.set('Last-Modified', s3Headers.LastModified); }

    var s = s3.getObject({Key:req.params.sha1}).createReadStream();
    s.on('error', function(err){ console.error(err); });
    s.pipe(res);
  });

});



app['delete']('/rmuser/:name', forceAuth, function(req, res, next){

  if (req.user.name !== req.params.name) {
    return next(errorCode('not allowed', 403));
  }

  var iri = rootCouchAdminUsers + 'org.couchdb.user:' + req.params.name;

  request.head(iri, function(err, resp) {
    if (err) return next(err);
    if (resp.statusCode >= 400) {
      return res.status(resp.statusCode).json({error: (resp.statusCode === 404)? 'user not found' : ('could not DELETE ' + req.user.name)});
    };
    var etag = resp.headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes
    request.del({url: iri, headers: {'If-Match': etag}, json:true}, function(err, resp, body){
      if (err) return next(err);
      res.status(resp.statusCode).json(body);
    });
  });

});

//TODO use REDIS and create a lock to validate that all the non
//namespaced parts exists in the registry (if so => links) if not =>
//invalid part @id (should be namespace/partId)
app.put('/:id', forceAuth, jsonParser, compactAndValidate, function(req, res, next){

  if (!('content-length' in req.headers)) {
    return res.status(411).json({error: 'Length Required'});
  }
  if (parseInt(req.headers['content-length'], 10) > 16777216) {
    return res.status(413).json({error: 'Request Entity Too Large, currently accept only package < 16Mo'});
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
  request.get({url: rootCouchRegistryRw + 'latestview/' + req.params.id, json: true}, function(err, resp, bodyView){
    if (err) return next(err);
    var ropts = {
      url: rootCouchRegistry +  _id,
      headers: { 'X-CouchDB-WWW-Authenticate': 'Cookie', 'Cookie': cookie.serialize('AuthSession', req.user.token) },
      json: cdoc
    };

    if (!bodyView.rows.length) { //first time ever we publish the document: add username to maintainers of the pkg
      cdoc.latest = true; //add latest tag Note: **never** rely on the `latest` tag to retrieve latest version, use views instead. the `latest` tag is used to simplify search indexes
      //add username to maintainers of the doc first (if not validate_doc_update will prevent the submission)
      var udoc = { username: req.user.name, namespace: req.params.id };
      request.put({url: rootCouchAdminUsersRw +  'add/org.couchdb.user:' + req.user.name, json: udoc}, function(err, respAdd, bodyAdd){
        if(err) return next(err);

        if (respAdd.statusCode >= 400 && respAdd.statusCode != 409) { //if 409: can be simultaneous call to the update function we keep going
          return next(errorCode('PUT /:id aborted: could not add ' + req.user.name + ' as a maintainer ' + bodyAdd.error, respAdd.statusCode));
        }

        //store the doc
        request.put(ropts, function(errCouch, respCouch, bodyCouch){
          if (errCouch || (respCouch.statusCode >= 400 && respCouch.statusCode !== 409)) { //if 409 we still need a maintainer
            request.put({url: rootCouchAdminUsersRw +  'rm/org.couchdb.user:' + req.user.name, json: udoc}, function(err, respRm, bodRm){
              if (err) console.error(err);
            });

            if (errCouch) {
              return next(errCouch);
            } else {
              return next(errorCode('PUT /:id aborted ' + bodyCouch.reason, respCouch.statusCode));
            }
          }

          return res.status((respCouch.statusCode === 200) ? 201: respCouch.statusCode).json(bodyCouch);
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
        ropts.url = rootCouchRegistryRw + 'update/' + _id; //<-call update handler to save a HEAD to get the _rev
        cdoc.latest = true;
      }

      request.put(ropts, function(err, resp, body){
        if (err) return next(err);
        if (resp.statusCode >= 400) {
          return next(errorCode(body, resp.statusCode));
        }

        if (isVersioned && cdoc.latest) { //remove previous latest tag (or tags if something went wrong at some point before...)
          request.get({url: rootCouchAdminRegistryRw + 'vtag/' + req.params.id, json:true}, function(errTagged, respTagged, bodyTagged){
            // if error we keep going, will be fixed at the next update..
            if (errTagged) { console.error(errTagged) };
            if (respTagged.statusCode >= 400) { console.error(errorCode(bodyTagged, respTagged.statusCode)) };

            var previousTags = bodyTagged.rows.filter(function(x){return x.value.version !== cdoc.version;});
            async.each(previousTags, function(tag, cb){
              request.put({url: rootCouchAdminRegistryRw + 'rmvtag/' + encodeURIComponent(tag.value._id), json:true}, function(err, resp, body){
                if (err) { console.error(err) };
                if (resp.statusCode >= 400) { console.error(errorCode(body, resp.statusCode)) };
                cb(null);
              });
            }, function(err){
              if (err) console.error(err);
              return res.status((resp.statusCode === 200) ? 201 : resp.statusCode).json(body);
            });

          });
        } else {
          return res.status((resp.statusCode === 200) ? 201 : resp.statusCode).json(body);
        }
      });

    }
  });

});


app['delete']('/:id/:version?', forceAuth, function(req, res, next){

  var version = req.params.version || req.query.version;

  async.waterfall([
    function(cb){ //get (all) the versions
      if (version) return cb(null, [encodeURIComponent(req.params.id + '@' + version)]);
      request.get({url: rootCouchRegistryRw + 'all/' + req.params.id, json:true}, function(err, resp, body){
        if (err) return cb(err);
        if (resp.statusCode >= 400) {
          return cb(errorCode(body, statusCode));
        }

        var _idList = body.rows.map(function(row){
          if ('version' in row.value){
            return encodeURIComponent(row.value['@id'].split(':')[1] + '@' + row.value.version);
          } else {
            return row.value['@id'].split(':')[1];
          }
        });

        if(!_idList.length){
          return cb(errorCode('not found', 404));
        }
        cb(null, _idList);
      });
    },
    function(_idList, cb){ //delete (all) the versions and the associated resources on S3
      async.each(_idList, function(_id, cb2){
        //get the doc so that we have it to get the resource to remove from S3 (by the time we delete S3 objects, the doc will have been deleted)
        request.get({ url: rootCouchRegistryRw + 'show/' + _id, json:true }, function(err, resp, cdoc){
          if (err) return cb2(err);
          if (resp.statusCode >= 400) return cb2(errorCode('could not GET ' + _id, resp.statusCode));
          //delete the doc on the registry
          request.head(rootCouchRegistry + _id, function(err, resp){
            if (err) return cb2(err);
            if (resp.statusCode >= 400) return cb2(errorCode('could not HEAD ' + _id, resp.statusCode));
            request.del({
              url: rootCouchRegistry + _id,
              headers: {
                'X-CouchDB-WWW-Authenticate': 'Cookie',
                'Cookie': cookie.serialize('AuthSession', req.user.token),
                'If-Match': resp.headers.etag.replace(/^"(.*)"$/, '$1'),
                json: true
              }
            }, function(err, resp, body){
              if (err) return cb2(err);
              if (resp.statusCode >= 400) return cb2(errorCode(body, resp.statusCode));
              s3util.deleteObjects(app.get('s3'), cdoc, rootCouchRegistryRw, function(err){
                if (err) console.error(err);
                cb2(null);
              });
            });
          });
        });
      }, function(err){
        if (err) return cb(err);
        cb(null, req.params.id);
      });
    }
  ], function(err, id){ //remove maintainers if all version of the doc have been deleted
    if (err) return next(err);

    request.get({url: rootCouchRegistryRw + 'all?key="' + id + '"', json:true}, function(err, resp, body){
      if (err) return next(err);
      if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));

      if (body.rows.length) { //still versions of :id to maintains, we are done
        res.json({ok: true});
      } else { //no more version of :id remove all the maintainers
        request.get({url: rootCouchAdminUsersRw + 'doc/' + id, json:true}, function(err, resp, maintainers){
          if (err) return next(err);
          if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));
          async.each(maintainers, function(maintainer, cb){
            request.put({
              url: rootCouchAdminUsersRw + 'rm/org.couchdb.user:' + maintainer.name,
              json: {username: maintainer.name, namespace: id}
            }, function(err, resp, body){
              if (err) return cb(err);
              if (resp.statusCode >= 400) return cb(errorCode(body, resp.statusCode));
              cb(null);
            });
          }, function(err){
            if(err) return next(err);
            res.json({ok:true});
          });
        });
      }
    });

  });

});


app.get('/maintainers/ls/:id', function(req, res, next){

  request.get({url: rootCouchAdminUsersRw + 'doc/' + req.params.id, json:true}, function(err, resp, body){
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(body, resp.statusCode));

    res.status(resp.statusCode).json(body);
  });

});

app.post('/maintainers/add', jsonParser, forceAuth, function(req, res, next){

  var data = req.body;

  if (!(('username' in data) && ('namespace' in data))) {
    return next(new Error('invalid POST data'));
  }

  //check if data.username (the user granted) is an existing user
  request.head(rootCouchAdminUsers + 'org.couchdb.user:' + data.username, function(err, resp){
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode('granted user does not exists', resp.statusCode));

    //check if req.user.name (the granter) is a maintainer of data.namespace
    request.get({url: rootCouchAdminUsersRw + 'maintains/org.couchdb.user:' + req.user.name, json:true}, function(err, resp, maintains){
      if (err) return next(err);
      if (resp.statusCode >= 400) return next(errorCode(maintains, resp.statusCode));

      if(maintains.indexOf(data.namespace) === -1){
        return next(errorCode('not allowed', 403));
      }

      request.put({url: rootCouchAdminUsersRw + 'add/org.couchdb.user:' + data.username, json:data}, function(err, resp, body){
        if (err) return next(err);
        res.status(resp.statusCode).json(body);
      });
    });
  });

});

/**
 * TODO do something (or not?) if a package has no maintainers ??
 */
app.post('/maintainers/rm', jsonParser, forceAuth, function(req, res, next){

  var data = req.body;

  if(!(('username' in data) && ('namespace' in data))){
    return next(new Error('invalid POST data'));
  }

  //check if req.user.name (the granter) is a maintainer of data.namespace
  request.get({url: rootCouchAdminUsersRw + 'maintains/org.couchdb.user:' + req.user.name, json:true}, function(err, resp, maintains){
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(maintains, resp.statusCode));

    if(maintains.indexOf(data.namespace) === -1){
      return next(errorCode('not allowed', 403));
    }

    request.put({url: rootCouchAdminUsersRw + 'rm/org.couchdb.user:' + data.username, json:data}, function(err, resp, body){
      if (err) return next(err);
      res.status(resp.statusCode).json(body);
    });
  });

});

/**
 * range can be specified with query string parameter `version`
 */
app.get('/:id/:part*?', maxSatisfyingVersion, function(req, res, next){

  var partId;
  if (req.params.part) {
    partId = req.url.replace(/^\/|\/$/g, '').split('/').slice(1).join('/');
    if (partId === decodeURIComponent(partId)) {
      partId = encodeURIComponent(partId);
    }
  }

  var uri;
  if (req.version) { //<-thanks to maxSatisfyingVersion middleware
    uri = rootCouchRegistryRw + 'show/' + encodeURIComponent(req.params.id + '@' + req.version);
  } else { // <- we want the latest version
    uri = rootCouchRegistryRw + 'latest/' + req.params.id;
  }

  if (partId) {
    uri += '/' + partId;
  }

  request.get({url: uri, json: true}, function(err, resp, cdoc){
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errorCode(cdoc, resp.statusCode));
    req.cdoc = cdoc;

    //TODO add schema:Action


    next();
  });

}, serveJsonld);



//generic error handling
app.use(function(err, req, res, next){
  res.status(err.code || 400).json({'error': err.message || ''});
});


s3.createBucket(function(err, data) {
  if(err) throw err;

  app.set('s3', s3);
  console.log('S3 bucket (%s) OK', bucket);

  httpServer.listen(port);
  httpsServer.listen(portHttps);
  console.log('Server running at http://127.0.0.1:' + port + ' (' + host + ')');
  console.log('Server running at https://127.0.0.1:' + portHttps + ' (' + host + ')');
});


function errorCode(msg, code){
  if (typeof msg === 'object') {
    msg = msg.reason || msg.error || 'error';
  }

  var err = new Error(msg);
  err.code = code;
  return err;
};
