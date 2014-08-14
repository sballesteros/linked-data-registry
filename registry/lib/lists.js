var lists = exports;

lists.latest = function(head, req){
  var row = getRow();

  if(!row){
    throw ['error', 'not_found', 'no results'];
  }

  var doc = row.doc;

  var util = require('pkg-util');

  start({ "headers": { "Content-Type": "application/json" } });
  send(JSON.stringify(util.clean(doc), null, 2));
};


lists.latestPart = function(head, req){
  var row = getRow();

  if(!row){
    throw ['error', 'not_found', 'no results'];
  }

  var doc = row.doc;

  var isUrl = require('is-url');
  var util = require('pkg-util');
  var forEachNode = require('for-each-node');

  var id = req.query.id;
  var partId = decodeURIComponent(req.query.part_id);

  //TODO handle the fact that there can be multiple parts
  var part;
  forEachNode(doc, function(prop, node){
    if (node['@id']) {
      var nodePartId;
      if (isUrl(node['@id'])) {
        nodePartId = node['@id'];
      } else if (partId === node['@id']) { // non SA CURIE e.g github:partId
        nodePartId = node['@id'];
      } else {
        nodePartId = node['@id'].split('sa:' + id + '/')[1];
      }

      if (nodePartId && nodePartId.replace(/^\/|\/$/g, '') === partId.replace(/^\/|\/$/g, '')) {
        part = node;
      }
    }
  });

  if (part) {

    start({ "headers": { "Content-Type": "application/json" } });
    send(JSON.stringify(util.clean(part), null, 2));

  } else { //inline data or invalid URL

    throw ['error', 'not_found', 'invalid part id'];

  }

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
