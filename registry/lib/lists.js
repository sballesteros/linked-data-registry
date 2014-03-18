var lists = exports;

lists.latest = function(head, req){
  var row = getRow();

  if(!row){
    throw ['error', 'not_found', 'no results'];
  }

  var doc = row.doc;

  var util = require('pkg-util');

  start({ "headers": { "Content-Type": "application/json" } });
  send(JSON.stringify(util.clean(doc, req), null, 2));

};


lists.versions = function(head, req){
  var row;
  var packages = [];
  while(row = getRow()){
    packages.push({
      '@type': 'Package',
      name: row.value.name,
      version: row.value.version,
      description: row.value.description,
      url: row.value.name + '/' + row.value.version,
    });
  }

  if(!packages.length){
    start({
      code: 404,
      headers: {"Content-Type": "application/json"}
    });
    return send(JSON.stringify({error: "no results"}));
  } else {
    start({"headers": {"Content-Type": "application/json"}});
    send(JSON.stringify({
      '@id': req.query.name,
      package: packages
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
