var util = require('util')
  , fs = require('fs')
  , path = require('path')
  , assert = require('assert')
  , request = require('request')
  , mime = require('mime')
  , zlib = require('zlib')
  , crypto = require('crypto');

var root = path.dirname(__filename);

function rurl(path){
  return 'http://127.0.0.1:3000' + path
};


describe('s3', function(){
  this.timeout(20000);
  
  it('should upload compressible attachments', function(done){
    var headers = {
      'Content-Length': 0,
      'Content-Type': mime.lookup('trace_0.csv'),
      'Content-MD5': undefined,
      'Content-Encoding': 'gzip'
    };

    var s = fs.createReadStream(path.join(root, 'fixture', 'trace_0.csv')).pipe(zlib.createGzip());
    var md5 = crypto.createHash('md5');
    s.on('data', function(d) {
      headers['Content-Length'] += d.length;
      md5.update(d);
    });
    s.on('end', function() {
      headers['Content-MD5'] = md5.digest('base64');

      var r =request.put( { url: rurl('/' + headers['Content-MD5']), auth: {user:'seb', pass: 'seb'}, headers: headers }, function(err, resp, body){
        if(err) throw err;
        assert('ETag' in JSON.parse(body));
        done();
      });
      fs.createReadStream(path.join(root, 'fixture', 'trace_0.csv')).pipe(zlib.createGzip()).pipe(r);
    }); 
  });

  it('should upload non compressible attachments', function(done){
    var headers = {
      'Content-Length': 0,
      'Content-Type': mime.lookup('daftpunk.jpg'),
      'Content-MD5': undefined
    };

    var s = fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg'));
    var md5 = crypto.createHash('md5');
    s.on('data', function(d) {
      headers['Content-Length'] += d.length;
      md5.update(d);
    });
    s.on('end', function() {
      headers['Content-MD5'] = md5.digest('base64');

      var r =request.put( { url: rurl('/' + headers['Content-MD5']), auth: {user:'seb', pass: 'seb'}, headers: headers }, function(err, resp, body){
        if(err) throw err;
        assert('ETag' in JSON.parse(body));
        done();
      });
      fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg')).pipe(r);
    }); 
  });


});
