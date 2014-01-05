var shows = exports;

shows.datapackage = function(doc,req){

  var util = require('dpkg-util')
    , ldpkgJsonLd = require('ldpkgJsonLd');
  
  util.clean(doc);

  return {
    headers: { 'Content-Type': 'application/json', 'Link': ldpkgJsonLd.link },
    body: JSON.stringify(doc)
  };

};


shows.resource = function(doc, req){

  var util = require('dpkg-util')
    , ldpkgJsonLd = require('ldpkgJsonLd');

  //hacky: TO BE IMPROVED
  function root(req){
    var protocol = (req.query.secure) ? 'https' : 'http';
    if(req.headers.Host.split(':')[1] == 443){
      protocol = 'https';
    }
    return protocol + '://' + req.headers.Host;
  };

  var r = doc.resources.filter(function(x){ return x.name === req.query.resource; })[0];
  if(r){

    return {
      headers: { 'Content-Type': 'application/json', 'Link': ldpkgJsonLd.link },
      body: JSON.stringify(r)
    };

  } else if (req.query.resource in doc._attachments){ // attachments

    return { code : 301, headers : { 'Location' : root(req) + '/registry/' + doc._id + '/' + req.query.resource } };

  } else { //inline data or invalid URL

    var splt = req.query.resource.split('.');
    r = doc.resources.filter(function(x){ return x.name === splt[0]; })[0];     
    if(r && splt.length > 1 ){
      return {
        headers: { 'Content-Type': 'application/json', 'Link': ldpkgJsonLd.link },
        body: (typeof r.data === 'string') ? r.data: JSON.stringify(r.data)
      };
    }
    
    throw ['error', 'not_found', 'invalid resource name'];
  }

};
