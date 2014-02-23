var shows = exports;

shows.container = function(doc,req){

  var util = require('ctnr-util');

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(util.clean(doc, req), null, 2)
  };

};


shows.dataset = function(doc, req){

  var util = require('ctnr-util');

  var r = doc.dataset.filter(function(x){ return x.name === req.query.dataset; })[0];
  if(r){

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else if (req.query.dataset in doc._attachments){ // attachments

    return { code : 301, headers : { 'Location' : util.root(req) + '/registry/' + doc._id + '/' + req.query.dataset } };

  } else { //inline data or invalid URL

    var splt = req.query.dataset.split('.');
    r = doc.dataset.filter(function(x){ return x.name === splt[0]; })[0];     
    if(r && splt.length > 1 ){
      return {
        headers: { 'Content-Type': 'application/json' },
        body: (typeof r.distribution.contentData === 'string') ? r.distribution.contentData: JSON.stringify(r.distribution.contentData, null, 2)
      };
    }

    throw ['error', 'not_found', 'invalid dataset name'];
  }

};


shows.code = function(doc, req){

  var r = doc.code.filter(function(x){ return x.name === req.query.code; })[0];
  if(r){

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid code entry name'];
  }

};



shows.figure = function(doc, req){

  var r = doc.figure.filter(function(x){ return x.name === req.query.figure; })[0];
  if(r){

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid figure name'];
  }

};
