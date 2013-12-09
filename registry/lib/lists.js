var lists = exports;

lists.latest = function(head, req){
  var row = getRow();
  var doc = row.doc;

  var util = require('dpkg-util');
  util.urlify(doc, req);
  util.clean(doc);


  start({"headers": {"Content-Type": "application/json"}});
  send(JSON.stringify(doc));
};

lists.search = function(head, req){
  
  var row;
  var cnt = 0;
  while(row = getRow()){
    if(!cnt) {
      start({"headers": {"Content-Type": "application/x-ldjson"}});
    }
    send(JSON.stringify(row) + '\n');
    cnt++;
  }
  
  if(!cnt){
    start({ code: 404 })
    return send(JSON.stringify({error: "no results"}));        
  }
};
