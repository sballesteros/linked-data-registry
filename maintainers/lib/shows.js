var shows = exports;

shows.maintains = function(doc,req){

  return {
    headers : {"Content-Type":"application/json"},
    body : JSON.stringify(doc.roles.filter(function(x){return x.charAt(0) !== '_';}))
  };

};


shows.user = function(doc,req){

  var body = {};
  //nice order
  ['@context', '@id', '@type'].forEach(function(x){
    if (doc[x]) {
      body[x] = doc[x];
    }
  });

  for (var key in doc) {
    if (key.charAt(0) !== '_' &&
        ! (key in body) &&
        key !== 'roles' &&
        key !== 'password' &&
        key !== 'password_sha' &&
        key !== 'type' &&
        key !== 'salt' &&
        key !== 'password_scheme' &&
        key !== 'iterations' &&
        key !== 'derived_key'
       ) {
      body[key] = doc[key];
    }
  }

  if (body.email) { //mailto: was rm for couch
    if (!(/^mailto:/.test(body.email))) {
      body.email = 'mailto:' + body.email;
    }
  }

  if (doc.roles) {
    var owns = doc.roles
      .filter(function(x) {return x.charAt(0) !== '_';})
      .map(function(x) {return {name: x};});

    if (owns.length) {
      body.owns = owns;
    }
  }

  return {
    headers : { "Content-Type":"application/ld+json" },
    body : JSON.stringify(body)
  };

};
