var updates = exports;

/**
 * create a new user
 */
updates.create = function(userDoc, req) {
  var resp = {headers : {"Content-Type" : "application/json"}};

  if (userDoc) {
    resp.code = 409;
    resp.body = JSON.stringify({error: "user already exists"});
    return [null, resp];
  } else {
    try {
      var data = JSON.parse(req.body);
    } catch(e) {
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
 * update an user profile
 */
updates.profile = function(userDoc, req) {
  var resp = {headers : {"Content-Type" : "application/json"}};

  if (!userDoc) {
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  }

  try {
    var data = JSON.parse(req.body);
  } catch(e){
    var err = e;
  }

  if (err ||
      Array.isArray(data) ||
      data['@id'] ||
      data['name'] ||
      data['password_scheme'] ||
      data['iterations'] ||
      data['derived_key'] ||
      data['salt']
     )
  {
    resp.body = JSON.stringify({error: "db update update: invalid data" });
    resp.code = 400;
    return [null, resp];
  }

  for (var key in data) {
    if (data[key]) {
      userDoc[key] = data[key];
    } else {
      delete userDoc[key];
    }
  }

  resp.code = 200;
  resp.body = JSON.stringify(data);
  return [userDoc, resp];
};




/**
 * add new permissions
 */
updates.add = function (userDoc, req) {
  var resp = {headers : {"Content-Type" : "application/json"}};

  if (!userDoc) {
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  }

  try {
    var data = JSON.parse(req.body);
  } catch(e){
    var err = e;
  }

  if (err ||
      !(typeof data.permissions === 'string') ||
      !(typeof data.namespace === 'string') ||
      (data.namespace.charAt(0) === '_')
     )
  {
    resp.body = JSON.stringify({error: "db update add: invalid data" });
    resp.code = 400;
    return [null, resp];
  }

  var pos = userDoc.roles
        .filter(function(role){
          return role.charAt(0) !== '_';
        })
        .map(function(role){
          return role.split('@')[0];
        })
        .indexOf(data.namespace);


  if (pos === -1) {
    userDoc.roles.push(data.namespace + '@' + data.permissions);
  } else {
    var permissions = userDoc.roles[pos].split('@')[1];
    //add new permission if not here already
    for (var i=0; i<data.permissions.length; i++) {
      if (permissions.indexOf(data.permissions[i]) === -1) {
        permissions += data.permissions[i];
      }
    }
    userDoc.roles[pos] = data.namespace + '@' + permissions;
  }

  resp.code = 200;
  resp.body = JSON.stringify(userDoc.roles);
  return [userDoc, resp];
};

/**
 * remove permissions
 */
updates.rm = function (userDoc, req) {
  var resp = {headers : {"Content-Type" : "application/json"}};

  if (!userDoc) {
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  }

  try {
    var data = JSON.parse(req.body);
  } catch(e){
    var err = e;
  }

  if (err ||
      !(typeof data.namespace === 'string') ||
      !(typeof data.permissions === 'string') ||
      (data.namespace.charAt(0) === '_')
     )
  {
    resp.body = JSON.stringify({error: "db update rm: invalid data" });
    resp.code = 400;
    return [null, resp];
  }

  var pos = userDoc.roles
        .filter(function(role){
          return role.charAt(0) !== '_';
        })
        .map(function(role){
          return role.split('@')[0];
        })
        .indexOf(data.namespace);

  if (pos === -1) {
    resp.body = JSON.stringify({error: "Unauthorized"});
    resp.code = 401;
    return [null, resp];
  }

  var keptPermissions = '';
  var currentPermissions = userDoc.roles[pos].split('@')[1] || '';

  //remove permission contains in data.permissions from `currentPermissions`
  for (var i=0; i < currentPermissions.length; i++) {
    if ((data.permissions || '').indexOf(currentPermissions[i]) === -1) {
      keptPermissions += currentPermissions[i];
    }
  }

  if (!keptPermissions) {
    userDoc.roles.splice(pos, 1);
  } else {
    userDoc.roles[pos] = data.namespace + '@' + keptPermissions;
  }

  resp.code = 200;
  resp.body = JSON.stringify(userDoc.roles);
  return [userDoc, resp];
};
