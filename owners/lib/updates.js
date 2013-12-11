var updates = exports;

/**
 * create a new user
 */
updates.create = function(userDoc, req){

  var resp = {headers : {"Content-Type" : "application/json"}};

  if(userDoc){
    resp.code = 409;
    resp.body = JSON.stringify({error: "user already exists"});
    return [null, resp];
  } else {

    var validate = require('validate');

    var errs = [];
    try{
      var data = JSON.parse(req.body);
    } catch(e){
      errs.push(e);
    }
    var err;
    if(err = validate.username(data.name)){
      errs.push(err);
    }
    if(data.password && (err = validate.pw(data.password))){
      errs.push(err);
    }
    if(err = validate.email(data.email)){
      errs.push(err);
    }

    if ( errs.length || (req.id !== ('org.couchdb.user:' +data.name)) ){
      resp.body = JSON.stringify({error: errs.map(function(e){return e.message;}).join(' ; ') || 'conficting username' });
      resp.code = 400;
      return [null, resp];      
    }

    userDoc = {
      _id: 'org.couchdb.user:' + data.name,
      name: data.name,
      roles: [],
      type: 'user',
      email: data.email,
      date: (new Date()).toISOString(),
      maintains: []
    };

    if('password' in data){
      userDoc.password = data.password;
    } else { //for cloudant
      userDoc.salt = data.salt;
      userDoc.password_sha = data.password_sha;
    }
    
    resp.code = 201;
    resp.body = JSON.stringify({ok: 'created'});      
    return [userDoc, resp];    
  }
    
};


/**
 * add req.body.dpkgName to the maitains list of userDoc. Can only be
 * done by admins.
 */ 
updates.add = function (userDoc, req) {

  var resp = {headers : {"Content-Type" : "application/json"}};
  
  if(!userDoc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else if (req.userCtx.roles.indexOf('_admin') !== -1){ //only admin can do what follows

    try{
      var data = JSON.parse(req.body);
    } catch(e){
      var err = e;
    }

    if (err || !( (typeof data.username === 'string') && (typeof data.dpkgName === 'string') )){
      resp.body = JSON.stringify({error: "invalid data" });
      resp.code = 400;
      return [null, resp];      
    }    

    if(userDoc.maintains.indexOf(data.dpkgName) === -1 ){
      userDoc.maintains.push(data.dpkgName);   
    }
    
    resp.code = 200;
    resp.body = JSON.stringify(userDoc.maintains);      
    return [userDoc, resp];

  } else {
    resp.body = JSON.stringify({error: "not allowed"});
    resp.code = 403;
    return [null, resp];
  }

};


updates.rm = function (userDoc, req) {

  var resp = {headers : {"Content-Type" : "application/json"}};
  
  if(!userDoc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else if (req.userCtx.roles.indexOf('_admin') !== -1){ //only admin can do what follows

    try{
      var data = JSON.parse(req.body);
    } catch(e){
      var err = e;
    }

    if (err || !( (typeof data.username === 'string') && (typeof data.dpkgName === 'string') )){
      resp.body = JSON.stringify({error: "invalid data" });
      resp.code = 400;
      return [null, resp];      
    }    

    var pos = userDoc.maintains.indexOf(data.dpkgName);
    if(pos !== -1 ){
      userDoc.maintains.splice(pos, 1);   
    }
    
    resp.code = 200;
    resp.body = JSON.stringify(userDoc.maintains);      
    return [userDoc, resp];

  } else {
    resp.body = JSON.stringify({error: "not allowed"});
    resp.code = 403;
    return [null, resp];
  }

};
