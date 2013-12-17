module.exports = function(newDoc, oldDoc, userCtx, secObj){

  if('_deleted' in newDoc){
    return;
  }

  //from http://www.pelagodesign.com/blog/2009/05/20/iso-8601-date-validation-that-doesnt-suck/
  var iso = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
  
  if(!newDoc.date || !iso.test(newDoc.date)){
    throw { forbidden: 'user must have an ISO8601 date property' };    
  }

//  if(!newDoc.salt){
//    throw { forbidden: 'user must have the salt used to generate the password_sha' };    
//  }
//
//  if(!newDoc.password_sha){
//    throw { forbidden: 'missing password_sha' };    
//  }

  if(!Array.isArray(newDoc.roles)){
    throw { forbidden: 'maintains must be an array' };
  } else {
    newDoc.roles.forEach(function(maintained){
      if(typeof maintained !== 'string' || newDoc.name.toLowerCase() !== newDoc.name ){
        throw { forbidden: 'roles must contains valid package names' };
      }
    });
  }
  
};
