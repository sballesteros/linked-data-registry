var shows = exports;

shows.datapackage = function(doc,req){

  delete doc._id; 
  delete doc._rev;
  delete doc._revisions;
  delete doc._attachments;

  return {
    headers : {"Content-Type":"application/json"},
    body : toJSON(doc)
  }

};


shows.resource = function(doc, req){

  function extname(filename) {
    var i = filename.lastIndexOf('.');
    return (i < 0) ? '' : filename.substr(i);
  };
  
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
    return { code : 301, headers : { 'Location' : 'http://' + req.headers.Host + '/stan/' + doc._id + '/' + r.name + extname(r.path) } };    
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
