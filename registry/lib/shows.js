var shows = exports;

shows.doc = function(doc,req){

  var util = require('pkg-util');

  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(util.clean(doc, req), null, 2)
  };

};


//TOOO update
shows.part = function(doc, req){

  var r = doc.dataset.filter(function(x){ return x.name === req.query.dataset; })[0];
  if(r){

    if(doc.private){
      r.private = doc.private;
    }

    if(r.distribution){
      r.distribution.forEach(function(x){
        if(x.contentData){
          delete x.contentData;
        }
      });
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(r, null, 2)
    };

  } else { //inline data or invalid URL

    throw ['error', 'not_found', 'invalid dataset name'];

  }

};
