var updates = exports;

/**
 * add distribution metadata
 */
updates.distribution = function(doc, req){

  var resp = {headers : {"Content-Type" : "application/json"}};

  if(!doc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else if (req.userCtx.roles.indexOf('_admin') !== -1){ //only admin can do what follows

    try {
      var data = JSON.parse(req.body);
    } catch(e){
      resp.body = JSON.stringify({error: "invalid data" });
      resp.code = 400;
      return [null, resp];      
    }

    doc.datePublished = (new Date()).toISOString();

    if(typeof data.contentRating === 'string'){
      doc.contentRating = data.contentRating;
    }

    if('dataset' in data && data.dataset.length){
      doc.dataset = data.dataset;
      doc.dataset.forEach(function(d){
        if(d.distribution){
          d.distribution.uploadDate = (new Date()).toISOString();
        }
      });
    }

    if('code' in data  && data.code.length){
      doc.code = data.code;
    }

    if('figure' in data && data.figure.length){
      doc.figure = data.figure;
      doc.figure.forEach(function(d){
        d.uploadDate = (new Date()).toISOString();
      });
    }

    if('article' in data && data.article.length){
      doc.article = data.article;
      doc.article.forEach(function(d){
        if(d.encoding){
          d.encoding.uploadDate = (new Date()).toISOString();
        }
      });
    }

    if(data.encoding){
      doc.encoding = data.encoding;
    }

    if(doc._attachments && doc._attachments['README.md']){
      doc.about = doc.about || {};
      doc.about.name = "README.md",
      doc.about.url = doc.name + '/' + doc.version + '/about/README.md'
    }

    resp.code = 200;
    resp.body = JSON.stringify({ok: 'distribution added'});
    return [doc, resp];

  } else {
    resp.body = JSON.stringify({error: "not allowed"});
    resp.code = 403;
    return [null, resp];
  }
  
};
