var shows = exports;

shows.package = function(doc,req){

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

    if(!req.query.content){
      return {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r, null, 2)
      };
    }

    if (req.query.content in doc._attachments) { // attachments

      return { code : 301, headers : { 'Location' : util.root(req) + '/' + doc._id + '/' + req.query.content } };

    } else if ( (req.query.content === '_content')  && r.distribution && r.distribution.contentUrl) {

      return { code : 301, headers : { 'Location' : util.resolveProxy(req, r.distribution.contentUrl) } };

    } else { //might be inline attachment

      var splt = req.query.content.split('.');
      if (r.name === splt[0] && r.distribution && r.distribution.contentData) {
        return {
          headers: { 'Content-Type': r.distribution.encodingFormat },
          body: (typeof r.distribution.contentData === 'string') ? r.distribution.contentData: JSON.stringify(r.distribution.contentData, null, 2)
        };
      } else {
        throw ['error', 'not_found', 'invalid attachment name'];
      }

    }

  } else { //inline data or invalid URL

    throw ['error', 'not_found', 'invalid dataset name'];

  }

};


shows.code = function(doc, req){

  var util = require('ctnr-util');

  var r = doc.code.filter(function(x){ return x.name === req.query.code; })[0];
  if(r){

    if(!req.query.content){
      return {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r, null, 2)
      };
    }

    if (req.query.content in doc._attachments){

      return { code : 301, headers : { 'Location' : util.root(req) + '/' + doc._id + '/' + req.query.content } };

    } else if ( (req.query.content === '_content')  && r.targetProduct && r.targetProduct.downloadUrl) {

      return { code : 301, headers : { 'Location' : util.resolveProxy(req, r.targetProduct.downloadUrl) } };

    } else {

      throw ['error', 'not_found', 'invalid attachment name'];

    }

  } else {

    throw ['error', 'not_found', 'invalid code entry name'];

  }

};



shows.figure = function(doc, req){

  var util = require('ctnr-util');

  var r = doc.figure.filter(function(x){ return x.name === req.query.figure; })[0];
  if(r){

    if(!req.query.content){
      return {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r, null, 2)
      };
    }

    if (req.query.content in doc._attachments){

      return { code : 301, headers : { 'Location' : util.root(req) + '/' + doc._id + '/' + req.query.content } };

    } else if ( (req.query.content === '_content')  && r.contentUrl) {

      return { code : 301, headers : { 'Location' : util.resolveProxy(req, r.contentUrl) } };

    } else {

      throw ['error', 'not_found', 'invalid attachment name'];

    }

  } else {
    throw ['error', 'not_found', 'invalid figure name'];
  }

};


shows.article = function(doc, req){

  var util = require('ctnr-util');

  var r = doc.article.filter(function(x){ return x.name === req.query.article; })[0];
  if(r){

    if(!req.query.content){
      return {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r, null, 2)
      };
    }

    if (req.query.content in doc._attachments){

      return { code : 301, headers : { 'Location' : util.root(req) + '/' + doc._id + '/' + req.query.content } };

    } else if ( (req.query.content === '_content')  && r.encoding && r.encoding.contentUrl ) {

      return { code : 301, headers : { 'Location' : util.resolveProxy(req, r.encoding.contentUrl) } };

    } else {

      throw ['error', 'not_found', 'invalid attachment name'];

    }

  } else {
    throw ['error', 'not_found', 'invalid article name'];
  }

};
