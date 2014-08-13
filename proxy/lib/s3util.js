var isUrl = require('is-url')
  , async = require('async')
  , request = require('request')
  , once = require('once')
  , Packager = require('package-jsonld')
  , url = require('url');

function deleteObjects(s3, cdoc, rootCouchResgistry, callback){

  var sha1s = [];

  function _collect(prop, node){
    ['downloadUrl', 'installUrl', 'contentUrl', 'embedUrl'].forEach(function(x){
      if (node[x]) {
        var sha1 = Packager.getSha1(node[x]);
        if (sha1) {
          sha1s.push(sha1);
        }
      }
    });
  };

  _collect(null, cdoc);
  Packager.forEachNode(_collect);

  async.filter(sha1s, function(sha1, cb){

    request.get({url: rootCouchRegistry + '_design/registry/_rewrite/bySha1/' + sha1, json:true}, function(err, resp, body){
      if(err) return cb(false);
      if(resp.statusCode >=400) return cb(null, false);

      cb(null, !body.rows.length); //TODO check
    });

  }, function(fsha1s){

    if (fsha1s.length) {
      s3.deleteObjects({Delete:{Objects: fsha1s.map(function(x){return {Key: x};})}}, callback);
    } else {
      callback(null);
    }

  });

};

function dereference(s3, uri, callback){
  var sha1 = getSha1(uri);

  if(sha1){

    s3.getObject({Key: sha1}, function(err, data){
      if(err) return callback(err);
      return callback(null, data);
    });

  } else {

    request({url:uri, encoding:null}, function(err, resp, body){ //TODO triple  check encoding null...
      if(err) return callback(err);
      if(resp.statusCode >= 400){
        return callback(errCode('could not retrieve body ' + uri, resp.statusCode));
      }

      return callback(null, {Body:body, ContentType: resp.headers['content-type'], ContentLength: resp.headers['content-length']});
    });

  }
};

function stream(s3, uri, callback){
  callback = once(callback);

  var sha1 = getSha1(uri);

  var s = {};

  if(sha1){

    s3.headObject({Key:sha1}, function(err, s3Headers) {
      if(err) return callback(err);

      if(s3Headers.ContentLength){ s.ContentLength = s3Headers.ContentLength; }
      if(s3Headers.ContentType){ s.ContentType = s3Headers.ContentType; }
      if(s3Headers.ContentEncoding){ s.ContentEncoding = s3Headers.ContentEncoding; }

      s.readable = s3.getObject({Key:sha1}).createReadStream();

      return callback(null, s);
    });

  } else {

    var req = request(this.rOpts(uri));
    req.on('error', callback);
    req.on('response', function(resp){
      if(resp.headers['content-length']){ s.ContentLength = resp.headers['content-length']; }
      if(resp.headers['content-type']){ s.ContentType = resp.headers['content-type']; }
      if(resp.headers['content-encoding']){ s.ContentEncoding = resp.headers['content-encoding']; }

      console.log(s);

      s.readable = resp;

      return callback(null, s);
    });

  }
};


exports.deleteObjects = deleteObjects;
exports.dereference = dereference;
exports.stream = stream;
