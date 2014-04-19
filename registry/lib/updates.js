var updates = exports;

/**
 * add distribution metadata
 */
updates.postpublish = function(doc, req){

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

    if(doc._attachments && doc._attachments['README.md']){
      doc.about = { name: 'README.md', url: doc.name + '/' + doc.version + '/about/README.md' };
    }

    ['dataset', 'code', 'figure', 'audio', 'video', 'article'].forEach(function(t){
      if(t in data && data[t].length){
        doc[t] = data[t];
      }
    });

    resp.code = 200;
    resp.body = JSON.stringify({ok: 'distribution added'});
    return [doc, resp];

  } else {
    resp.body = JSON.stringify({error: "not allowed"});
    resp.code = 403;
    return [null, resp];
  }

};
