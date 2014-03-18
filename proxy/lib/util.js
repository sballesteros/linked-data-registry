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


function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};


exports.getSha1 = getSha1;
exports.errorCode = errorCode;
