var shows = exports;

shows.doc = function(doc,req){

  var util = require('pkg-util');

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(util.clean(doc), null, 2)
  };

};


shows.part = function(doc, req){

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
      } else if (partId === node['@id']) { // non dcat.io CURIE e.g github:partId
        nodePartId = node['@id'];
      } else {
        nodePartId = node['@id'].split('ldr:' + id + '/')[1];
      }

      if (nodePartId && nodePartId.replace(/^\/|\/$/g, '') === partId.replace(/^\/|\/$/g, '')) {
        part = node;
      }
    }
  });

  if(part){

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(util.clean(part), null, 2)
    };

  } else { //inline data or invalid URL

    throw ['error', 'not_found', 'invalid part id'];

  }

};
