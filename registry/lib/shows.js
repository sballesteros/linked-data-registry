var shows = exports;

shows.datapackage = function(doc,req){

  var util = require('dpkg-util');

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(util.clean(doc, req), null, 2)
  };

};


shows.dataset = function(doc, req){

  var util = require('dpkg-util');

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


shows.analytics = function(doc, req){

  var r = doc.analytics.filter(function(x){ return x.name === req.query.analytics; })[0];
  if(r){

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid analytics name'];
  }

};
