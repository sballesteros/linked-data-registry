var http = require('http')
  , util = require('util')
  , express = require('express')
  , auth = require('basic-auth')
  , cookie = require('cookie')
  , httpProxy = require('http-proxy')
  , request = require('request')
  , async = require('async')
  , url = require('url');

var app = express()
  , server = http.createServer(app)
  , proxy = new httpProxy.RoutingProxy();

var proxyOptions = { host: process.env['COUCH_HOST'], port: process.env['COUCH_PORT'] }
  , admin = {name: process.env['COUCH_USER'], password: process.env['COUCH_PASS']}
  , port = process.env['NODE_PORT'] || 3000;

var nano = require('nano')(util.format('http://%s:%s@%s:%d', admin.name, admin.password, proxyOptions.host, proxyOptions.port)); //connect as admin (suppose to work on same machine as the db or use https)
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

var jsonParser = express.json();

app.get('/search', function(req, res, next){
  req.url = req.url.replace(req.route.path.split('?')[0], '/registry/_design/registry/_rewrite/search');
  proxy.proxyRequest(req, res, proxyOptions);
});

app.get('/install/:name/:version?', function(req, res, next){  
    
  if ('version' in req.params && req.params.version){
    req.url = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name + '@' + req.params.version));
  } else {
    req.url = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name) + '/latest');
  }

  proxy.proxyRequest(req, res, proxyOptions);
});

app.get('/resource/:name/:version/:resource', function(req, res, next){
  var myurl = req.url.replace(req.route.regexp, '/registry/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/' + req.params.resource);
  myurl = util.format('http://%s:%s@%s:%d%s', admin.name, admin.password, proxyOptions.host, proxyOptions.port, myurl);

  //TODO: resolve cyclic dependencies
  req.pipe(request(myurl)).pipe(res); //use request to handle the redirect
});

app.put('/adduser/:name', jsonParser, function(req, res, next){
  var data = req.body;
  //can only be done by an admin
  _users.atomic('maintainers', 'create', 'org.couchdb.user:' + data.name, data, function(err, body, header){
    if(err) return next(err);
    res.json(header['status-code'], body);
  });          
});


app.put('/publish/:name/:version', secure, function(req, res, next){
  
  var headers = req.headers;
  delete headers.authorization;
  headers['X-CouchDB-WWW-Authenticate'] = 'Cookie';
  headers['Cookie'] = cookie.serialize('AuthSession', req.user.token);

  var id = encodeURIComponent(req.params.name + '@' + req.params.version);

  var options = {
    port: 5984,
    hostname: '127.0.0.1',
    method: 'PUT',
    path: '/registry/' + id,
    headers: headers
  };

  var reqCouch = http.request(options, function(resCouch){
    resCouch.setEncoding('utf8');
    var data = '';
    resCouch.on('data', function(chunk){ data += chunk; });
    resCouch.on('end', function(){

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
        res.json(resCouch.statusCode, JSON.parse(data));
      }

    });

  });  
  req.pipe(reqCouch);

});


app.del('/unpublish/:name/:version?', secure, function(req, res, next){

  async.waterfall([

    function(cb){ //get (all) the versions
      if (req.params.version) return cb(null, [req.params.name + '@' +req.params.version]);
      registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0'], reduce: false}, function(err, body){      
        if(err) return cb(err);
        cb(null, body.rows.map(function(x){return x.id;}));
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


app.get('/owner/ls/:dpkgName', function(req, res, next){
  _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.dpkgName}, function(err, body) {
    if (err) return next(err);
    res.json(body);
  });
});


app.post('/owner/add', jsonParser, secure, function(req, res, next){

  var data = req.body;

  if(!(('username' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }
  
  //check if req.user.name is a maintainter of data.dpkgname
  _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user.name, function(err, maintains) {
    if(err) return next(err);
    
    if(maintains.indexOf(data.dpkgName) === -1){
      return next(errorCode('not allowed', 403));
    }
    _grant(data, res, next);
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

    _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + data.username, data, function(err, body){
      if(err) return next(err);
      res.json(body);
    });

  });

});

function _grant(data, res, next, codeForced){
  _users.atomic('maintainers', 'add', 'org.couchdb.user:' + data.username, data, function(err, body, header){
    if(err) return next(err);
    res.json(codeForced || header['status-code'], body);
  });
};

function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};

server.listen(port);
console.log('Server running at http://127.0.0.1:' + port);
