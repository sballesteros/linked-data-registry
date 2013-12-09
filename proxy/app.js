var http = require('http')
  , express = require('express')
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

app.get('/owner/ls/:dpkgName', function(req, res, next){
  _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.dpkgName}, function(err, body) {
    if (err) return next(err);
    res.json(body);
  });
});

app.post('/owner/add', function(req, res, next){

  var data = req.body;
  
  if(!(('granter' in data) && ('granted' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }

  if(data.granter === data.granted){ // => first maintainer => retrieve dpkg (with data._id) and check if dpkg.username === data.granter;

    if(!('_id' in data)){
      return next(new Error('invalid data'));
    }

    registry.show('registry', 'firstUsername', data._id, function(err, dpkg) {
      if (err) return _fail(res, err);
      if( data.granter && (dpkg.username !== data.granter) ){
        return next(erroCode('not allowed', 403));
      }
      _grant(data, res, next);
    });

  } else { //not the first time, check if granter is a maintainter of data.dpkgname

    _users.show('maintainers', 'maintains', 'org.couchdb.user:' + data.granter, function(err, maintains) {
      if(err) return next(err);
      
      if(maintains.indexOf(data.dpkgName) === -1){
        return next(errorCode('not allowed', 403));
      }
      _grant(data, res, next);
    });

  }

});

app.post('/owner/rm', function(req, res, next){

  var data = req.body;

  
  if(!(('granter' in data) && ('banned' in data) && ('dpkgName' in data))){
    return next(new Error('invalid data'));
  }

  _users.show('maintainers', 'maintains', 'org.couchdb.user:' + data.granter, function(err, maintains) {
    if(err) return next(err);

    if(maintains.indexOf(data.dpkgName) === -1){
      return next(errorCode('not allowed', 403));
    }

    _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + data.banned, data, function(err, body){
      if(err) return next(err);
      res.json(200, body);
    });

  });

});

function _grant(data, res, next){
  _users.atomic('maintainers', 'add', 'org.couchdb.user:' + data.granted, data, function(err, body){
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
