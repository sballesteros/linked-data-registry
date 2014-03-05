module.exports = function(newDoc, oldDoc, userCtx, secObj){

  try {
    var url = require('url')
      , isUrl = require('is-url')
      , semver = require('semver')
      , pjsonld = require('package-jsonld')
      , tv4 = require('tv4');
  } catch(e){
    throw { forbidden: e.message };
  }
  
  if (!userCtx || (userCtx && !userCtx.name)) {
    throw { unauthorized: 'Please log in before writing to the db' };
  }

  //taken from https://github.com/isaacs/npmjs.org/blob/master/registry/validate_doc_update.js
  function _isAdmin () {
    if (secObj &&
        secObj.admins) {
      if (secObj.admins.names &&
          secObj.admins.roles &&
          secObj.admins.names.indexOf(userCtx.name) !== -1) return true;
      for (var i=0;i<userCtx.roles.length;i++) {
        if (secObj.admins.roles.indexOf(userCtx.roles[i]) !== -1) return true;
      }
    }
    return userCtx && userCtx.roles.indexOf("_admin") >= 0;
  };

  function _canWrite () {
    if (_isAdmin()) return true;

    for (var i = 0; i< userCtx.roles.length; i ++) {
      if (userCtx.roles[i] === (newDoc.name || oldDoc.name)) return true;
    }
    return false;
  };

  if(!_canWrite()){
    throw { forbidden: 'user: ' + userCtx.name + ' not authorized to maintain ' + (newDoc.name || oldDoc.name) };
  }
  
  if (newDoc._deleted) return;

  try {
    pjsonld.validateName(newDoc.name);
  } catch(e){
    throw { forbidden: e.message };
  }

  //validate newDoc using schema json
  if( !tv4.validate(newDoc, pjsonld.schema) ){
    throw { forbidden: tv4.error.message };
  }
  
  //validate that if it has a context it's ours
  if('@context' in newDoc){
    var reCtx = new RegExp(pjsonld.contextUrl.replace(/^https/, 'http').replace(/^http/, 'https?'));    
    if( ! ( (typeof newDoc['@context'] === 'string') && reCtx.test(newDoc['@context'])) ){
      throw { forbidden: 'invalid @context' };
    }
  }

  //validate version  
  if(!semver.valid(newDoc.version)){
    throw { forbidden: 'invalid version ' + newDoc.version };    
  }

  //validate _id
  var _id = newDoc.name + '@' + newDoc.version;
  if(newDoc._id !== _id){
    throw { forbidden: 'invalid _id ' + newDoc._id };    
  }

  //validate dependencies and that links are version compatible (i.e a document cannot require url from a version !== from the current doc)
  try {
    pjsonld.validateRequire(newDoc);
  } catch(e){
    throw { forbidden: e.message };    
  }

  if('datePublished' in newDoc){
    //from http://www.pelagodesign.com/blog/2009/05/20/iso-8601-date-validation-that-doesnt-suck/
    var iso = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
    
    if(!iso.test(newDoc.datePublished)){
      throw { forbidden: 'invalide datePublished' };    
    } 
  }

  //check that figures are figures (MIME type)
  if('figure' in newDoc){
    newDoc.figure.forEach(function(f){
      if(f.contentPath){
        var attKey = f.contentPath.split('/');
        attKey = attKey[attKey.length -1];
        if(newDoc._attachments && newDoc._attachments[attKey]){
          if(['image/png', 'image/jpeg', 'image/tiff', 'image/gif', 'application/pdf', 'application/postscript'].indexOf(newDoc._attachments[attKey].content_type) === -1){
            throw { forbidden: 'invalide MIME type for figure (' + newDoc._attachments[attKey].content_type + ')' }; 
          }
        }
      }
    });
  }

  



  //stuff that can never be modified
  if(oldDoc){
    if(oldDoc.name !== newDoc.name) {
      throw { forbidden: 'name should not be modified' };
    }
  }

};
