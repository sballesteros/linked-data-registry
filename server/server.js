var http = require('http')
  , url = require('url')
  , nano = require('nano')('http://seb:seb@localhost:5984'); //connect as admin (suppose to work on same machine as the db or use https)

var stan = nano.db.use('stan');
var _users = nano.db.use('_users');

var server = http.createServer(function (req, res) {

  var pathname = url.parse(req.url).pathname;
  if(pathname !== '/'){
    _fail(res, new Error('invalid roote'));
  } else if (req.method != 'POST') {
    _fail(res, new Error('need a POST request'));
  } else {
    req.setEncoding('utf8');
    var data = '';
    req.on('data', function(chunk){ data += chunk; });
    req.on('end', function(){

      try {
        data = JSON.parse(data);
      } catch(e){
        return _fail(res, new Error('invalid data'));
      }

      if(!(('granter' in data) && ('granted' in data) && ('dpkgName' in data))){
        return _fail(res, new Error('invalid data'));
      }

      if(data.granter === data.granted){ // => first maintainer => retrieve dpkg (with data._id) and check if dpkg.username === data.granter;

        if(!('_id' in data)){
          return _fail(res, new Error('invalid data'));
        }

        stan.show('registry', 'firstUsername', data._id, function(err, dpkg) {
          if (err) return _fail(res, err);
          if( data.granter && (dpkg.username !== data.granter) ){
            return _fail(res, new Error('not allowed'), 403);
          }
          _grant(res, data);
        });

      } else { //not the first time, check if granter is a maintainter of data.dpkgname

        _users.show('maintainers', 'maintains', data.granter, function(err, maintains) {
          if(err) return _fail(res, err);

          if(maintains.indexOf(data.granter) === -1){
            return _fail(res, new Error('not allowed'), 403);
          }
          _grant(res, data);
        });

      }

    });
  }

});

server.listen(8000);

console.log('Server running at http://127.0.0.1:8000/');

function _fail(response, err, code){
  var data = JSON.stringify({'error': err.message || ''});
  response.writeHead(code || 400, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)});
  response.end(data);
};

function _grant(response, data){
  _users.atomic('maintainers', 'maintains', 'org.couchdb.user:' + data.granted, data, function(err, body){
    if(err) return _fail(response, err);
    body = JSON.stringify(body);
    response.writeHead(200, {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)});
    response.end(body);
  });
};
