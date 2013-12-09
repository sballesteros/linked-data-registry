var updates = exports;

/**
 * add req.body.dpkgName to the maitains list of userDoc. Can only be
 * done by admins.
 */ 
updates.maintains = function (userDoc, req) {

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

    if (err || !( (typeof data.granted === 'string') && (typeof data.dpkgName === 'string') )){
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
