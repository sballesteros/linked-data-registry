module.exports = function(newDoc, oldDoc, userCtx, secObj){
  
  if (!userCtx || (userCtx && !userCtx.name)) {
    throw { unauthorized: 'Please log in before writing to the db' };
  }

  if(oldDoc && ('username' in newDoc)){
    throw { forbidden: 'document cannot have an username property' };
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
    if ( !oldDoc ) return true;
    if (_isAdmin()) return true;

    if(userCtx.maintains && 'name' in newDoc){
      for (var i = 0; i< userCtx.maintains.length; i ++) {
        if (userCtx.maintains[i] === newDoc.name) return true;
      }
    }
    return false;
  };
  
  if(!_canWrite){
    throw { forbidden: 'user: ' + userCtx.name + ' not authorized to modify ' + oldDoc.name + '@' + oldDoc.version };
  }

  if (newDoc._deleted) return;

  //validate newDoc using schema json
  try{
    var tv4 = require('tv4');
  } catch(e){
    throw { forbidden: e.message };
  }

  var $schema =  {
    $schema: 'http://json-schema.org/draft-04/schema#',
    type: 'object', 
    properties: {
      name: { type: 'string' },
      _username: { type: 'string' },
      version: { type: 'string' },
      description: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
      dataDependencies: { type: 'object', patternProperties: {'': { 'type': 'string' } } },
      resources: { type: 'array' },
      date: { type: "string" }
    },
    required: ['name', 'version', 'resources', 'date']
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

  //from http://www.pelagodesign.com/blog/2009/05/20/iso-8601-date-validation-that-doesnt-suck/
  var iso = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
  
  if(!iso.test(newDoc.date)){
    throw { forbidden: 'invalide date' };    
  } 

  //stuff that can never be modified
  if(oldDoc){
    if(oldDoc.name !== newDoc.mame) {
      throw { forbidden: 'name should not be modified' };
    }
  }

};
