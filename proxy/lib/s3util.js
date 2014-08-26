var async = require('async')
  , request = require('request')
  , SaSchemaOrg = require('sa-schema-org');

function deleteObjects(s3, cdoc, rootCouchRegistryRw, callback){

  var sha1s = [];

  function _collect(prop, node){
    ['downloadUrl', 'installUrl', 'contentUrl', 'embedUrl'].forEach(function(x){
      if (node[x]) {
        var sha1 = SaSchemaOrg.getSha1(node[x]);
        if (sha1) {
          sha1s.push(sha1);
        }
      }
    });
  };

  _collect(null, cdoc);
  SaSchemaOrg.forEachNode(_collect);

  async.filter(sha1s, function(sha1, cb){
    request.get({url: rootCouchRegistryRw + 'sha1/' + sha1, json:true}, function(err, resp, body){
      if(err) return cb(false);
      if(resp.statusCode >=400) return cb(false); //!!async.filter only take 1 arg in callback (true or false, no error)
      cb(!body.rows.length);
    });
  }, function(fsha1s){
    if (fsha1s.length) {
      s3.deleteObjects({Delete:{Objects: fsha1s.map(function(x){return {Key: x};})}}, callback);
    } else {
      callback(null);
    }
  });

};

exports.deleteObjects = deleteObjects;
