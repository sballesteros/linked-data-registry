var isUrl = require('is-url')
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

    request(uri, function(err, resp, body){
      if(err) return callback(err);
      if(resp.statusCode >= 400){
        return callback(errCode('could not retrieve body ' + uri, resp.statusCode));
      }

      return callback(null, {Body:body, ContentType: resp.headers['content-type'], ContentLength: resp.headers['content-length']});
    });

  }
};

function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};


exports.dereference = dereference;
exports.getSha1 = getSha1;
exports.errorCode = errorCode;
