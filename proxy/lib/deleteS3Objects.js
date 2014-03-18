var request = require('request')
  , url = require('url')
  , async = require('async')
  , isUrl = require('is-url');


function getSha1(uri){
  if(!isUrl(uri)){
    return uri.replace(/^\//, '');
  } else {
    purl = url.parse(uri);
    if(purl.hostname === 'registry.standardanalytics.io'){
      return purl.pathname.replace(/^\//, '');
    }
  }
  return undefined;
};

module.exports = function(req, pkg, callback){

  var sha1s = [];

  console.log(require('util').inspect(pkg, {depth:null}));

  (pkg.dataset || []).forEach(function(r){
    if(r.distribution && r.distribution.contentUrl){
      var sha1 = getSha1(r.distribution.contentUrl);
      if(sha1){
        sha1s.push(sha1);
      }
    }
  });

  (pkg.code || []).forEach(function(r){
    if(r.targetProduct && r.targetProduct.downloadUrl){
      var sha1 = getSha1(r.targetProduct.downloadUrl);
      if(sha1){
        sha1s.push(sha1);
      }
    }
  });

  (pkg.figure || []).forEach(function(r){
    if(r.contentUrl){
      var sha1 = getSha1(r.contentUrl);
      if(sha1){
        sha1s.push(sha1);
      }
    }
  });

  (pkg.article || []).forEach(function(r){
    if(r.encoding && r.encoding.contentUrl){
      var sha1 = getSha1(r.encoding.contentUrl);
      if(sha1){
        sha1s.push(sha1);
      }
    }
  });

  console.log(sha1s);

  async.filter(sha1s, function(sha1, cb){

    request(req.app.get('rootCouchRegistry') + '/_design/registry/_view/bySha1?key="' + sha1 + '"', function(err, resp, body){
      if(err) return cb(false);
      if(resp.statusCode >=400) return cb(null, false);

      cb(! JSON.parse(body).rows.length);
    });

  }, function(fsha1s){

    if (fsha1s.length) {
      req.app.get('s3').deleteObjects({Delete:{Objects: fsha1s.map(function(x){return {Key: x};})}}, callback);
    } else {
      callback(null);
    }

  });

};
