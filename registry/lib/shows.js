var shows = exports;

shows.package = function(doc,req){

  var util = require('pkg-util');

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(util.clean(doc, req), null, 2)
  };

};


shows.dataset = function(doc, req){

  var r = doc.dataset.filter(function(x){ return x.name === req.query.dataset; })[0];
  if(r){

    if(doc.private){
      r.private = doc.private;
    }

    if(r.distribution && r.distribution.contentData){
      delete r.distribution.contentData;
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else { //inline data or invalid URL

    throw ['error', 'not_found', 'invalid dataset name'];

  }

};


shows.code = function(doc, req){

  var r = doc.code.filter(function(x){ return x.name === req.query.code; })[0];
  if(r){

    if(doc.private){
      r.private = doc.private;
    }

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

    if(doc.private){
      r.private = doc.private;
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid figure name'];
  }

};

shows.audio = function(doc, req){

  var r = doc.audio.filter(function(x){ return x.name === req.query.audio; })[0];
  if(r){

    if(doc.private){
      r.private = doc.private;
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid audio name'];
  }

};

shows.video = function(doc, req){

  var r = doc.video.filter(function(x){ return x.name === req.query.video; })[0];
  if(r){

    if(doc.private){
      r.private = doc.private;
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid video name'];
  }

};


shows.article = function(doc, req){

  var r = doc.article.filter(function(x){ return x.name === req.query.article; })[0];
  if(r){

    if(doc.private){
      r.private = doc.private;
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else {
    throw ['error', 'not_found', 'invalid article name'];
  }

};
