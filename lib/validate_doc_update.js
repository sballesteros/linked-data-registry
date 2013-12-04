module.exports = function(newDoc, oldDoc, userCtx, secObj){
  
  if (!userCtx || (userCtx && !userCtx.name)) {
    throw { unauthorized: 'Please log in before writing to the db' };
  }

  //taken from https://github.com/isaacs/npmjs.org/blob/master/registry/validate_doc_update.js
  function _isAdmin () {
    if (secObj &&
        secObj.admins) {
      if (secObj.admins.names &&
          secObj.admins.roles &&
          secObj.admins.names.indexOf(user.name) !== -1) return true
      for (var i=0;i<user.roles.length;i++) {
        if (secObj.admins.roles.indexOf(user.roles[i]) !== -1) return true
      }
    }
    return user && user.roles.indexOf("_admin") >= 0
  }

  //taken from https://github.com/isaacs/npmjs.org/blob/master/registry/validate_doc_update.js
  function _canWrite () {
    if ( !oldDoc ) return true;
    if (_isAdmin()) return true
    if (typeof oldDoc.maintainers !== "object") return true
    for (var i = 0; i< oldDoc.maintainers.length; i ++) {
      if (oldDoc.maintainers[i].name === userCtx.name) return true;
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
      version: { type: 'string' },
      description: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
      dataDependencies: { type: 'object', patternProperties: {'': { 'type': 'string' } } },
      resources: { type: 'array' },
      //data-registry specific
      maintainers: { 
        type: 'array', 
        items: {
          type: 'object',
          properties: {
            name: { type: 'string'},
            email: { type: 'string'}
          },
          required: ['name','email']
        }
      },
      date: { type: "string" }
    },
    required: ['name', 'version', 'resources']//, 'maintainers', 'date']
  };

  if( !tv4.validate(newDoc, $schema) ){
    throw { forbidden: tv4.error.message };
  }

  //stuff that can never be modified
  if(oldDoc){
    if(oldDoc.name !== newDoc.mame) {
      throw { forbidden: 'name should not be modified' };
    }
  }

};
