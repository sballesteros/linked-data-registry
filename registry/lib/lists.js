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
