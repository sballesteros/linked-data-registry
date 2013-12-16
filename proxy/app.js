var http = require('http')
  , https = require('https')
  , util = require('util')
  , fs = require('fs')
  , path = require('path')
  , express = require('express')
  , querystring = require('querystring')
  , auth = require('basic-auth')
  , cookie = require('cookie')
  , request = require('request')
  , async = require('async')
  , url = require('url');


var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;


var credentials = {
  key: fs.readFileSync(path.join($HOME, 'stan_ssl', 'stan_registry.key'), 'utf8'),
  cert: fs.readFileSync(path.join($HOME, 'stan_ssl', 'certificate-42234.crt'), 'utf8'),
  ca: fs.readFileSync(path.join($HOME, 'stan_ssl', 'GandiStandardSSLCA.pem'), 'utf8')
};

var app = express()
  , httpServer = http.createServer(app)
  , httpsServer = https.createServer(credentials, app);

var couchDb = { ssl: process.env['COUCH_SSL'], host: process.env['COUCH_HOST'], port: process.env['COUCH_PORT'], portHttps: process.env['COUCH_PORT_HTTPS'] } //CouchDB settings
  , admin = {name: process.env['COUCH_USER'], password: process.env['COUCH_PASS']}
  , host = process.env['NODE_HOST'] 
  , port = process.env['NODE_PORT'] || 80
  , portHttps = process.env['NODE_PORT_HTTPS'] || 443;

var rootHttp = util.format('http://%s:%s', couchDb.host, couchDb.port)
  , rootHttps = util.format('%s://%s:%s', (couchDb.ssl == 1) ? 'https': 'http', couchDb.host, couchDb.portHttps) //https is optional so that we can play localy without SSL in production it should be 1
  , rootAdmin = util.format('%s://%s:%s@%s:%d', (couchDb.ssl == 1) ? 'https': 'http', admin.name, admin.password, couchDb.host, couchDb.portHttps);

var nano = require('nano')(rootAdmin); //connect as admin
var registry = nano.db.use('registry')
  , _users = nano.db.use('_users');

app.use(app.router);
app.use(function(err, req, res, next){
  res.json(err.code || err.status_code || 400, {'error': err.message || ''});
});

function secure(req, res, next){

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


function forceHttp(req, res, next){
  if(req.secure){
    res.redirect("http://" + req.headers.host + req.path);
  } else {
    next();
  }
};


var jsonParser = express.json();

app.get('/search', function(req, res, next){
  var rurl = req.url.replace(req.route.path.split('?')[0], '/registry/_design/registry/_rewrite/search');
  res.redirect(rootHttp + rurl);

});


app.put('/adduser/:name', jsonParser, function(req, res, next){
  var data = req.body;
  //can only be done by an admin
  _users.atomic('maintainers', 'create', 'org.couchdb.user:' + data.name, data, function(err, body, headers){
    if(err) return next(err);
    res.json(headers['status-code'], body);
  });          
});


app.post('/owner/add', jsonParser, secure, function(req, res, next){

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

app.post('/owner/rm', jsonParser, secure, function(req, res, next){

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


app.get('/versions/:name', function(req, res, next){

  var rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/versions/' + req.params.name);  
  res.redirect(rootHttp + rurl);
});


app.get('/:name/:version?', function(req, res, next){  

  var q = req.query || {};
  q.proxy = host  + ((port != 80) ? (':' + port) : '');

  var rurl;
  if ('version' in req.params && req.params.version){
    rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name + '@' + req.params.version));
  } else {
    rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name) + '/latest');
  }
  rurl += '?' + querystring.stringify(q);


  res.redirect(rootHttp + rurl);

});

app.get('/:name/:version/:resource', function(req, res, next){

  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/' + req.params.resource);
  rurl += (qs) ? '?' + qs : '';

  res.redirect(rootHttp + rurl);
  
});



app.put('/:name/:version', secure, function(req, res, next){

//  var headers = req.headers;
//  delete headers.authorization;
//  headers['X-CouchDB-WWW-Authenticate'] = 'Cookie';
//  headers['Cookie'] = cookie.serialize('AuthSession', req.user.token);

  var id = encodeURIComponent(req.params.name + '@' + req.params.version);

  if(!('content-length' in req.headers)){
    return res.json(411, {error: 'Length Required'});
  }

  if(req.headers['content-length'] > 209715200){
    return res.json(413, {error: 'Request Entity Too Large, currently accept only data package < 200Mo'});
  }

  var reqCouch = request.put(rootHttp + '/registry/'+ id, function(err, resCouch, body){
    if(resCouch.statusCode === 201){
      //add maintainer to maintains
      registry.show('registry', 'firstUsername', id, function(err, dpkg) {      
        if (err) return _fail(res, err);
        if( req.user.name && (dpkg.username !== req.user.name) ){
          return next(erroCode('not allowed', 403));
        }
        _grant({username: req.user.name, dpkgName: req.params.name}, res, next, 201);
      });

    } else {
      res.json(resCouch.statusCode, body);
    }
  });
  req.pipe(reqCouch);

});


app.del('/:name/:version?', secure, function(req, res, next){

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
          registry.destroy(id, etag, cb2);
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
