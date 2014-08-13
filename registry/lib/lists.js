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


lists.search = function(head, req){
  var row;
  var cnt = 0;
  start({"headers": {"Content-Type": "application/x-ldjson"}});
  while(row = getRow()){
    if (row.value.private !== true) {
      send(JSON.stringify(row) + '\n');
    }
    cnt++;
  }

  if(!cnt){
    throw ['error', 'not_found', 'no results'];
  }
};
