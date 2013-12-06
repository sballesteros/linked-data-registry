var lists = exports;

lists.latest = function(head, req){
  var row = getRow();
  var doc = row.doc;

  delete doc._id; 
  delete doc._rev;
  delete doc._revisions;
  delete doc._attachments;

  start({"headers": {"Content-Type": "application/json"}});
  send(JSON.stringify(doc));
};
