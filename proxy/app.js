var http = require('http')
  , express = require('express')
  , auth = require('basic-auth')
  , async = require('async')
  , url = require('url')
  , nano = require('nano')('http://seb:seb@localhost:5984'); //connect as admin (suppose to work on same machine as the db or use https)

var app = express()
  , server = http.createServer(app);

var registry = nano.db.use('registry')
  , _users = nano.db.use('_users');

app.use(express.json());
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
      req.user = user.name;
      next();
    } else {
      res.json(403 , {'error': 'Forbidden'});
    }
  });

};


app.delete('/unpublish/:name/:version?', secure, function(req, res, next){

  var id = req.params.name + '@' + req.params.version; 

  registry.head(id, function(err, _, headers) {
    if(err) return next(err);

    var etag = headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes
    registry.destroy(id, etag, function(err, body) {
      if(err) return next(err);
      registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0']}, function(err, body){
        if(err) return next(err);
        if(!body.rows.length){ //no more version of name: remove all the maintainers

          _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.name}, function(err, maintainers) {
            if (err) return next(err);

            async.each(maintainers, function(maintainer, cb){
              _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + maintainer.name, {username: maintainer.name, dpkgName: req.params.name}, cb);          
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

});


app.get('/owner/ls/:dpkgName', function(req, res, next){
  _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.dpkgName}, function(err, body) {
    if (err) return next(err);
    res.json(body);
  });
});

app.post('/owner/add', secure, function(req, res, next){

  var data = req.body;

  if(!(('username' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }
  
  if(data.username === req.user){ // => first maintainer => retrieve dpkg (with data._id) and check if dpkg.username === req.user;

    if(!('_id' in data)){
      return next(new Error('invalid data'));
    }

    registry.show('registry', 'firstUsername', data._id, function(err, dpkg) {      
      if (err) return _fail(res, err);
      if( req.user && (dpkg.username !== req.user) ){
        return next(erroCode('not allowed', 403));
      }
      _grant(data, res, next);
    });

  } else { //not the first time, check if req.user is a maintainter of data.dpkgname

    _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user, function(err, maintains) {
      if(err) return next(err);
      
      if(maintains.indexOf(data.dpkgName) === -1){
        return next(errorCode('not allowed', 403));
      }
      _grant(data, res, next);
    });

  }

});

app.post('/owner/rm', secure, function(req, res, next){

  var data = req.body;

  
  if(!(('username' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }

  _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user, function(err, maintains) {
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

function _grant(data, res, next){
  _users.atomic('maintainers', 'add', 'org.couchdb.user:' + data.username, data, function(err, body){
    if(err) return next(err);
    res.json(200, body);
  });
};

function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};

server.listen(8000);
console.log('Server running at http://127.0.0.1:8000/');
