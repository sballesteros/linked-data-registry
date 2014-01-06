var lists = exports;

lists.latest = function(head, req){
  var row = getRow();

  if(!row){
    throw ['error', 'not_found', 'no results'];
  }
  
  var doc = row.doc;

  var util = require('dpkg-util')
    , ldpkgJsonLd = require('ldpkgJsonLd');

  start({
    "headers": {
      "Content-Type": "application/json",
      'Link': ldpkgJsonLd.link + ((doc._attachments && 'README.md' in doc._attachments) ? ', <' + util.root(req) + '/registry/' + doc._id + '/' +'README.md>; rel="profile"' :'')
    }
  });
  send(JSON.stringify(util.clean(doc), null, 2));

};

lists.versions = function(head, req){

  var ldpkgJsonLd = require('ldpkgJsonLd');

  var row;
  var catalogs = [];
  while(row = getRow()){
    catalogs.push({
      '@type': 'DataCatalog',
      name: row.value.name,
      version: row.value.version,
      description: row.value.description,
      url: row.value.name + '/' + row.value.version,
    });
  }
  
  if(!catalogs.length){
    start({ 
      code: 404,   
      headers: {"Content-Type": "application/json"}
    });
    return send(JSON.stringify({error: "no results"}));        
  } else {
    start({"headers": {
      "Content-Type": "application/json",
      'Link': ldpkgJsonLd.link
    }});
    send(JSON.stringify({
      '@id': req.query.name,
      '@type': 'DataCatalog',
      catalog: catalogs
    }, null, 2));
  }
};


lists.search = function(head, req){  
  var row;
  var cnt = 0;
  start({"headers": {"Content-Type": "application/x-ldjson"}});
  while(row = getRow()){
    send(JSON.stringify(row) + '\n');
    cnt++;
  }
  
  if(!cnt){
    throw ['error', 'not_found', 'no results'];
  }
};
