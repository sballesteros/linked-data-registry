var shows = exports;

shows.datapackage = function(doc,req){

  var util = require('dpkg-util');
  util.urlify(doc, req);
  util.clean(doc);

  return {
    headers : {"Content-Type":"application/json"},
    body : JSON.stringify(doc)
  }

};


shows.resource = function(doc, req){

  var util = require('dpkg-util');
  
  var r = doc.resources.filter(function(x){ return x.name === req.query.resource; })[0];
  if (!r){
    throw ['error', 'not_found', 'invalid resource name'];
  }

  if('data' in r){
    return {
      headers : {"Content-Type":"application/json"},
      body : JSON.stringify(r.data)
    }    
  } else if ('path' in r){
    return { code : 301, headers : { 'Location' : 'http://' + req.headers.Host + '/registry/' + doc._id + '/' + r.name + util.extname(r.path) } };    
  } else if ('url' in r){
    return { code : 301, headers : { 'Location' : r.url } };   
  } else {
    throw ['error', 'not_found', 'resource has no data'];
  }

};

shows.firstUsername = function(doc,req){

  return {
    headers : {"Content-Type":"application/json"},
    body : JSON.stringify({
      _id: doc._id,
      _rev: doc._rev,
      username: doc.username || ''
    })
  };

};
