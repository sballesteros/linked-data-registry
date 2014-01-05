var shows = exports;

shows.datapackage = function(doc,req){

  var util = require('dpkg-util')
    , ldpkgJsonLd = require('ldpkgJsonLd');

  return {
    headers: { 
      'Content-Type': 'application/json', 
      'Link': ldpkgJsonLd.link + ((doc._attachments && 'README.md' in doc._attachments) ? ', <' + util.root(req) + '/registry/' + doc._id + '/' +'README.md>; rel="profile"' :'')
    },
    body: JSON.stringify(util.clean(doc))
  };

};


shows.dataset = function(doc, req){

  var util = require('dpkg-util')
    , ldpkgJsonLd = require('ldpkgJsonLd');

  var r = doc.dataset.filter(function(x){ return x.name === req.query.dataset; })[0];
  if(r){

    return {
      headers: { 'Content-Type': 'application/json', 'Link': ldpkgJsonLd.link },
      body: JSON.stringify(r)
    };

  } else if (req.query.dataset in doc._attachments){ // attachments

    return { code : 301, headers : { 'Location' : util.root(req) + '/registry/' + doc._id + '/' + req.query.dataset } };

  } else { //inline data or invalid URL

    var splt = req.query.dataset.split('.');
    r = doc.dataset.filter(function(x){ return x.name === splt[0]; })[0];     
    if(r && splt.length > 1 ){
      return {
        headers: { 'Content-Type': 'application/json', 'Link': ldpkgJsonLd.link },
        body: (typeof r.data === 'string') ? r.data: JSON.stringify(r.data)
      };
    }
    
    throw ['error', 'not_found', 'invalid dataset name'];
  }

};
