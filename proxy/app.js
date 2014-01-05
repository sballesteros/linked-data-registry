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
  , url = require('url');

mime.define({
  'application/ld+json': ['jsonld'],
  'application/x-ldjson': ['ldjson', 'ldj']
});

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

var credentials = {
  //key: fs.readFileSync(path.join($HOME, 'stan_ssl', 'server_key.pem')),
  //cert: fs.readFileSync(path.join($HOME, 'stan_ssl', 'server_cert.pem'))
  key: fs.readFileSync(path.join($HOME, 'stan_ssl', 'stan_registry.key')),
  cert: fs.readFileSync(path.join($HOME, 'stan_ssl', 'certificate-42234.crt')),
  ca: fs.readFileSync(path.join($HOME, 'stan_ssl', 'GandiStandardSSLCA.pem'))
};

var app = express()
  , httpServer = http.createServer(app)
  , httpsServer = https.createServer(credentials, app);

var couch = { ssl: process.env['COUCH_SSL'], host: process.env['COUCH_HOST'], port: process.env['COUCH_PORT'] } //CouchDB settings
  , admin = {name: process.env['COUCH_USER'], password: process.env['COUCH_PASS']}
  , host = process.env['NODE_HOST'] 
  , port = process.env['NODE_PORT'] || 80
  , portHttps = process.env['NODE_PORT_HTTPS'] || 443;

var rootCouch = util.format('%s://%s:%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port) //https is optional so that we can play localy without SSL. That being said, in production it should be 1!
  , rootCouchAdmin = util.format('%s://%s:%s@%s:%d', (couch.ssl == 1) ? 'https': 'http', admin.name, admin.password, couch.host, couch.port);

var nano = require('nano')(rootCouchAdmin); //connect as admin
var registry = nano.db.use('registry')
  , _users = nano.db.use('_users');

app.use(app.router);
app.use(function(err, req, res, next){
  res.json(err.code || err.status_code || 400, {'error': err.message || ''});
});


function forceAuth(req, res, next){

  var user = auth(req);
  if(!user){
    return res.json(401 , {'error': 'Unauthorized'});
  }

  nano.auth(user.name, user.pass, function (err, body, headers) {
    if (err) { 
      return next(err);
    }

    if (headers && headers['set-cookie']) {
      try {
        var token = cookie.parse(headers['set-cookie'][0])['AuthSession'];
      } catch(e){
        return next(new Error('no cookie for auth: ' + e.message));
      }
      req.user = { name: user.name, token: token };
      next();
    } else {
      res.json(403 , {'error': 'Forbidden'});
    }
  });

};




var jsonParser = express.json();

app.get('/search', function(req, res, next){
  var rurl = req.url.replace(req.route.path.split('?')[0], '/registry/_design/registry/_rewrite/search');
  res.redirect(rootCouch + rurl);
});


app.put('/adduser/:name', jsonParser, function(req, res, next){
  var data = req.body;

  _users.atomic('maintainers', 'create', 'org.couchdb.user:' + data.name, data, function(err, body, headers){
    if(err) return next(err);
    res.json(headers['status-code'], body);
  });          
});


app.del('/rmuser/:name', forceAuth, function(req, res, next){

  if(req.user.name !== req.params.name){
    return next(errorCode('not allowed', 403));
  }

  var id = 'org.couchdb.user:' + req.params.name;

  _users.head(id, function(err, _, headers) {
    if(err) return next(err);
    var etag = headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes
    
    _users.destroy(id, etag, function(err, body, headers){
      if(err) return next(err);
      res.json(headers['status-code'], body);
    });
  });

});



app.post('/owner/add', jsonParser, forceAuth, function(req, res, next){

  var data = req.body;

  if(!(('username' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }

  //check if data.username is an existing user
  _users.head('org.couchdb.user:' + data.username, function(err, _, headers){
    if(err) return next(err);
    if(headers['status-code'] >= 400){
      return next(errorCode('granted user does not exists', headers['status-code']));
    }

    //check if req.user.name is a maintainter of data.dpkgname
    _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user.name, function(err, maintains, headers) {
      if(err) return next(err);
      
      if(maintains.indexOf(data.dpkgName) === -1){
        return next(errorCode('not allowed', 403));
      }
      _grant(data, res, next, headers['status-code']);
    });

  });


});


//TODO DO something if a package has no maintainers
app.post('/owner/rm', jsonParser, forceAuth, function(req, res, next){

  var data = req.body;
  
  if(!(('username' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }

  _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user.name, function(err, maintains) {
    if(err) return next(err);

    if(maintains.indexOf(data.dpkgName) === -1){
      return next(errorCode('not allowed', 403));
    }

    _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + data.username, data, function(err, body, headers){
      if(err) return next(err);
      res.json(headers['status-code'], body);
    });

  });

});



app.get('/owner/ls/:dpkgName', function(req, res, next){
  _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.dpkgName}, function(err, body, headers) {
    if (err) return next(err);
    res.json(headers['status-code'], body);
  });
});


/**
 * list of versions
 */
app.get('/:name', function(req, res, next){

  var rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/versions/' + req.params.name);  
  res.redirect(rootCouch + rurl);
});


/**
 * middleware to get maxSatisfying version of a Semver range 
 */
function maxSatisfyingVersion(req, res, next){
  
  var q = req.query || {};

  if (! ('range' in q)) {
    return next();
  }

  //get all the versions of the dpkg
  request(rootCouch + '/registry/_design/registry/_rewrite/versions/' + req.params.name, function(err, res, versions){
    if(err) return next(err);

    if (res.statusCode >= 400){
      return next(errorCode('oops something went wrong when trying to validate the version', resCouch.statusCode));
    }

    versions = JSON.parse(versions);
    req.params.version = semver.maxSatisfying(versions, q.range);
    if(!req.params.version){
      return next(errorCode('no version could satisfy the range ' + q.range, 404));
    }

    next();
  });

};


app.get('/:name/:version', maxSatisfyingVersion, function(req, res, next){  

  var q = req.query || {};
  if(req.secure){
    q.proxy = 'https://' + host  + ((portHttps != 443) ? (':' + portHttps) : '');
  } else {
    q.proxy = 'http://' + host  + ((port != 80) ? (':' + port) : '');
  }
  var rurl;
  if (req.params.version === 'latest'){
    rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name) + '/latest');
  } else {
    rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name + '@' + req.params.version));
  }
  rurl += '?' + querystring.stringify(q);

  
  res.redirect(rootCouch + rurl);

});


app.get('/:name/:version/:resource', maxSatisfyingVersion, function(req, res, next){
  
  if(couch.ssl == 1){
    req.query.secure = true;
  }

  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/' + req.params.resource);
  rurl += (qs) ? '?' + qs : '';

  res.redirect(rootCouch + rurl);  
});


app.put('/:name/:version', forceAuth, function(req, res, next){

  var id = encodeURIComponent(req.params.name + '@' + req.params.version);

  if(!('content-length' in req.headers)){
    return res.json(411, {error: 'Length Required'});
  }

  if(req.headers['content-length'] > 209715200){
    return res.json(413, {error: 'Request Entity Too Large, currently accept only data package < 200Mo'});
  }

  function addDistributionAndstore(){
    var reqCouch = request.put(rootCouch + '/registry/'+ id, function(err, resCouch, body){

      if(err) return next(err);
      body = JSON.parse(body);

      if(resCouch.statusCode >= 400){
        return next(errorCode('publish aborted', resCouch.statusCode));
      }

      registry.get(body.id, {att_encoding_info: true}, function(err, doc) {
        if(err) return next(err);
        
        //add distribution (TODO mv inside couch update function (but no crypto and no buffer inside :( ))
        var resources = doc.resources || [];

        //TODO support encoding (MediaObject) for resources (@type === 'DataSet')
        //encoding: {encodingFormat: csv} -> usefull for inline data

        resources.forEach(function(r){
          if('data' in r){

            var s = (typeof r.data === 'string') ? r.data: JSON.stringify(r.data);

            var format;
            if( ('encoding' in r) && (typeof r.encoding === 'object') && !Array.isArray(r.encoding) && (typeof r.encoding.encodingFormat === 'string') ){
              format =  r.encoding.encodingFormat;
            } else {
              format = (typeof r.data === 'string') ? 'txt':
                (s.indexOf('@context') !== -1) ? 'jsonld' : 'json';
            }

            r.distribution = {
              contentUrl: '/' + doc._id.replace('@', '/') + '/' + r.name + '.' + format,
              contentSize: Buffer.byteLength(s, 'utf-8'),
              encodingFormat: format,
              hashAlgorithm: 'md5',
              hashValue: crypto.createHash('md5').update(s).digest('hex')
            };

          } else if ('path' in r && '_attachments' in doc){
            
            var basename = path.basename(r.path);
            var att = doc._attachments[basename];   
            if(!att) return;

            r.distribution = {
              contentUrl: '/' + doc._id.replace('@', '/') + '/' + basename,
              contentSize: att.length,
              encodingFormat: mime.extension(att.content_type),
              hashAlgorithm: 'md5',
              hashValue:  (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex')
            };

            if('encoding' in att){
              r.distribution.encoding = {
                contentSize: att.encoded_length,
                encodingFormat: att.encoding
              };
            }

          } else if ('url' in r) {
            r.distribution = { isBasedOnUrl: r.url };
          }
        });
        
        registry.atomic('registry', 'distribution', doc._id, resources, function(err, body, headers){
          if(err) return next(err);
          res.json((headers['status-code'] === 200) ? 201: headers['status-code'], body);
        });

      });

    });
    req.pipe(reqCouch);
  };

  registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0'], reduce: true}, function(err, body, headers){      
    if(err) return next(err);
    if(!body.rows.length){ //first version ever: add username to maintainers of the dpkg
      _users.atomic('maintainers', 'add', 'org.couchdb.user:' + req.user.name, {username: req.user.name, dpkgName: req.params.name}, function(err, body, headers){
        if(err) return next(err);

        if(headers['status-code'] >= 400){
          return next(errorCode('publish aborted: could not add ' + req.user.name + ' as a maintainer', headers['status-code']));
        } else {
          addDistributionAndstore();
        };

      });
    } else {
      addDistributionAndstore();
    }
  });

});


app.del('/:name/:version?', forceAuth, function(req, res, next){

  async.waterfall([

    function(cb){ //get (all) the versions
      if (req.params.version) return cb(null, [req.params.name + '@' +req.params.version]);
      registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0'], reduce: false}, function(err, body){      
        if(err) return cb(err);
        var ids = body.rows.map(function(x){return x.id;});
        if(!ids.length){
          return cb(errorCode('not found', 404));
        }
        cb(null, ids);
      });
    },

    function(ids, cb){ //delete (all) the versions
      
      async.each(ids, function(id, cb2){
        registry.head(id, function(err, _, headers) {
          if(err) return cb2(err);
          var etag = headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes

          //Do NOT do that as admin: otherwise doc are ALWAYS deleted so DO NOT USE registry.destroy(id, etag, cb2);
          request.del({
            url: rootCouch + '/registry/' + id + '?rev=' +etag,
            headers: {
              'X-CouchDB-WWW-Authenticate': 'Cookie',
              'Cookie': cookie.serialize('AuthSession', req.user.token)
            }
          }, function(err, resp, body){
            if(err) return cb2(err);
            body = JSON.parse(body);
            if(resp.statusCode === 403){
              return cb2(errorCode(body.reason, resp.statusCode));
            }
            cb2(null, body);
          });          
        });

      }, function(err, _){
        if(err) return cb(err);
        cb(null, req.params.name);
      });

    },

  ], function(err, name){ //remove maintainers if all version of the package have been deleted    
    if(err) return next(err);

    registry.view('registry', 'byNameAndVersion', {startkey: [name], endkey: [name, '\ufff0']}, function(err, body){
      if(err) return next(err);
      if(!body.rows.length){ //no more version of name: remove all the maintainers

        _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: name}, function(err, maintainers) {
          if (err) return next(err);

          async.each(maintainers, function(maintainer, cb){
            _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + maintainer.name, {username: maintainer.name, dpkgName: name}, cb);          
          }, function(err){
            if(err) return next(err);
            res.json({ok:true});
          });

        });          
        
      } else {
        res.json({ok:true});
      }
    });    
    
  });

});


function _grant(data, res, next, codeForced){
  _users.atomic('maintainers', 'add', 'org.couchdb.user:' + data.username, data, function(err, body, headers){
    if(err) return next(err);
    res.json(codeForced || headers['status-code'], body);
  });
};


function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};


httpServer.listen(port);
httpsServer.listen(portHttps);
console.log('Server running at http://127.0.0.1:' + port + ' (' + host + ')');
console.log('Server running at https://127.0.0.1:' + portHttps + ' (' + host + ')');
