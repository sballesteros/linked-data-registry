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

    doc.dateModified = (new Date()).toISOString();
    if(!doc.datePublished){
      doc.datePublished = doc.dateModified;
    }

    if(typeof data.contentRating === 'string'){
      doc.contentRating = data.contentRating;
    }
    
    ['dataset', 'code', 'figure', 'audio', 'video', 'article'].forEach(function(t){
      //replace resources by postprocessed ones
      if(t in data && data[t].length){
        doc[t] = data[t];
      }
    });

    resp.code = 200;
    resp.body = JSON.stringify({ok: "postpublish ok"});
    return [doc, resp];

  } else {
    resp.body = JSON.stringify({error: "not allowed"});
    resp.code = 403;
    return [null, resp];
  }

};
