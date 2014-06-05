var isUrl = require('is-url')
  , request = require('request')
  , once = require('once')
  , url = require('url');

function getSha1(uri){
  if(!isUrl(uri)){
    return uri.replace(/^\/|\/$/g, '').split('/')[1];
  } else {
    purl = url.parse(uri);
    if(purl.hostname === 'registry.standardanalytics.io'){
      return purl.pathname.replace(/^\/|\/$/g, '').split('/')[1];
    }
  }
  return undefined;
};

function dereference(uri, s3, callback){
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

function stream(uri, s3, callback){
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

function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};


exports.stream = stream;
exports.dereference = dereference;
exports.getSha1 = getSha1;
exports.errorCode = errorCode;
