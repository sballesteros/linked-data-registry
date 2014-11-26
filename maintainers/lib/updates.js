var updates = exports;

/**
 * create a new user
 */
updates.create = function(userDoc, req){
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
    userDoc.readAccess = [];

    resp.code = 201;
    resp.body = JSON.stringify({ok: 'created'});
    return [userDoc, resp];
  }
};

/**
 * add / replace permissions
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


  var newRole = data.namespace + '@' + data.permissions;
  if (pos === -1 ) {
    userDoc.roles.push(newRole);
  } else {
    userDoc.roles[pos] = newRole;
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
    userDoc.roles[pos] = data.namespace + '@' + newPermissions;
  }

  resp.code = 200;
  resp.body = JSON.stringify(userDoc.roles);
  return [userDoc, resp];
};

//TODO remove
updates.addReadAccess = function (userDoc, req) {
  var resp = {headers : {"Content-Type" : "application/json"}};

  if (!userDoc) {
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else {
    try {
      var data = JSON.parse(req.body);
    } catch(e) {
      var err = e;
    }

    if (err || !(typeof data.namespace === 'string')) {
      resp.body = JSON.stringify({error: "db update addReadAccess: invalid data" });
      resp.code = 400;
      return [null, resp];
    }

    if (userDoc.readAccess.indexOf(data.namespace) === -1 ) {
      userDoc.readAccess.push(data.namespace);
    }

    resp.code = 200;
    resp.body = JSON.stringify(userDoc.readAccess);
    return [userDoc, resp];
  }
};

//TODO remove
updates.rmReadAccess = function (userDoc, req) {
  var resp = {headers : {"Content-Type" : "application/json"}};

  if (!userDoc) {
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else {
    try {
      var data = JSON.parse(req.body);
    } catch(e) {
      var err = e;
    }

    if (err || !(typeof data.namespace === 'string')) {
      resp.body = JSON.stringify({error: "db update rm: invalid data" });
      resp.code = 400;
      return [null, resp];
    }

    var pos = userDoc.readAccess.indexOf(data.namespace);
    if (pos !== -1 ) {
      userDoc.readAccess.splice(pos, 1);
    }

    resp.code = 200;
    resp.body = JSON.stringify(userDoc.readAccess);
    return [userDoc, resp];
  }
};
