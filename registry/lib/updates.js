var updates = exports;

/**
 * add distribution
 */
updates.distribution = function(doc, req){

  var ldpkgJsonLd = require('ldpkgJsonLd');

  var resp = {headers : {"Content-Type" : "application/json"}};

  if(!doc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  } else if (req.userCtx.roles.indexOf('_admin') !== -1){ //only admin can do what follows

    try{
      var data = JSON.parse(req.body);
    } catch(e){
      resp.body = JSON.stringify({error: "invalid data" });
      resp.code = 400;
      return [null, resp];      
    }

    doc.datePublished = (new Date()).toISOString();
    doc.resources = data;

    
    
    
    resp.code = 200;
    resp.body = JSON.stringify({ok: 'distribution added'});
    return [ldpkgJsonLd.ify(doc, {addCtx:false}), resp];

  } else {
    resp.body = JSON.stringify({error: "not allowed"});
    resp.code = 403;
    return [null, resp];
  }
  
};
