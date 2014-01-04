module.exports = function(newDoc, oldDoc, userCtx, secObj){
  
  if (!userCtx || (userCtx && !userCtx.name)) {
    throw { unauthorized: 'Please log in before writing to the db' };
  }

  if(['rmuser', 'adduser', 'owner', 'search'].indexOf(newDoc.name) !==-1){
    throw { forbidden: 'data package cannot be named '+ newDoc.name };    
  }

  if(newDoc.name && ( (typeof newDoc.name !== 'string') || (newDoc.name.toLowerCase() !== newDoc.name) || (newDoc.name.charAt(0) === '_') )){
    throw { forbidden: 'invalid data package name (data package name have to be in lower case and not start with "_")' };
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

  //validate newDoc using schema json
  try {
    var tv4 = require('tv4');
  } catch(e){
    throw { forbidden: e.message };
  }

  var $schema =  {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object', 
    properties: {
      name: { type: 'string' },
      version: { type: 'string' },
      description: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
      dataDependencies: { type: 'object', patternProperties: {'': { 'type': 'string' } } },
      resources: { type: 'array' }
    },
    required: ['name', 'version']
  };

  if( !tv4.validate(newDoc, $schema) ){
    throw { forbidden: tv4.error.message };
  }
  
  //validate version
  try{
    var semver = require('semver');
  } catch(e){
    throw { forbidden: e.message };
  }
  
  if(!semver.valid(newDoc.version)){
    throw { forbidden: 'invalid version ' + newDoc.version };    
  }

  //validate _id
  var _id = newDoc.name + '@' + newDoc.version;
  if(newDoc._id !== _id){
    throw { forbidden: 'invalid _id ' + newDoc._id };    
  }

  if('datePublished' in newDoc){
    //from http://www.pelagodesign.com/blog/2009/05/20/iso-8601-date-validation-that-doesnt-suck/
    var iso = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
    
    if(!iso.test(newDoc.datePublished)){
      throw { forbidden: 'invalide datePublished' };    
    } 
  }

  //stuff that can never be modified
  if(oldDoc){
    if(oldDoc.name !== newDoc.name) {
      throw { forbidden: 'name should not be modified' };
    }
  }

};
