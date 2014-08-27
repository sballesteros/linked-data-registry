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
    try{
      var data = JSON.parse(req.body);
    } catch(e){
      resp.body = JSON.stringify({error: e.message});
      resp.code = 400;
      return [null, resp];
    }

    userDoc = data;
    userDoc._id = 'org.couchdb.user:' + data.name;
    userDoc.roles = [];
    userDoc.type = 'user';

    resp.code = 201;
    resp.body = JSON.stringify({ok: 'created'});
    return [userDoc, resp];
  }
};


/**
 * add req.body.namespace to the roles list of userDoc. Can only be
 * done by admins.
 */
updates.add = function (userDoc, req) {

  var resp = {headers : {"Content-Type" : "application/json"}};

  if(!userDoc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else {
    try{
      var data = JSON.parse(req.body);
    } catch(e){
      var err = e;
    }

    if (err || !( (typeof data.username === 'string') && (typeof data.namespace === 'string') ) || (data.namespace.charAt(0) === '_') ) {
      resp.body = JSON.stringify({error: "db update add: invalid data" });
      resp.code = 400;
      return [null, resp];
    }

    if(userDoc.roles.indexOf(data.namespace) === -1 ){
      userDoc.roles.push(data.namespace);
    }

    resp.code = 200;
    resp.body = JSON.stringify(userDoc.roles);
    return [userDoc, resp];
  }
};


updates.rm = function (userDoc, req) {

  var resp = {headers : {"Content-Type" : "application/json"}};

  if(!userDoc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else {
    try{
      var data = JSON.parse(req.body);
    } catch(e){
      var err = e;
    }

    if (err || !( (typeof data.username === 'string') && (typeof data.namespace === 'string') ) || (data.namespace.charAt(0) === '_') ){
      resp.body = JSON.stringify({error: "db update rm: invalid data" });
      resp.code = 400;
      return [null, resp];
    }

    var pos = userDoc.roles.indexOf(data.namespace);
    if(pos !== -1 ){
      userDoc.roles.splice(pos, 1);
    }

    resp.code = 200;
    resp.body = JSON.stringify(userDoc.roles);
    return [userDoc, resp];
  }
};
