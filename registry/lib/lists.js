var lists = exports;

lists.latest = function(head, req){
  var row = getRow();

  if(!row){
    throw ['error', 'not_found', 'no results'];
  }
  
  var doc = row.doc;

  var util = require('dpkg-util');
  util.clean(doc);

  start({"headers": {"Content-Type": "application/json"}});
  send(JSON.stringify(doc));
};

lists.versions = function(head, req){

  var row;
  var versions = [];
  while(row = getRow()){
    versions.push(row.id.split('@')[1]);
  }
  
  if(!versions.length){
    start({ 
      code: 404,   
      headers: {"Content-Type": "application/json"}
    });
    return send(JSON.stringify({error: "no results"}));        
  } else {
    start({"headers": {"Content-Type": "application/json"}});
    send(JSON.stringify(versions));
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
