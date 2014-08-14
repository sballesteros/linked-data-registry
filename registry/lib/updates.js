var updates = exports;


updates.body = function(doc, req){
  var resp = {headers : {"Content-Type" : "application/json"}};

  if(!doc){
    resp.body = JSON.stringify({ok: "nothing to do, nothing done"});
    return [null, resp];
  }

  try {
    var data = JSON.parse(req.body);
  } catch(e){
    resp.body = JSON.stringify({error: "invalid JSON" });
    resp.code = 400;
    return [null, resp];
  }

  for (var key in doc) {
    if (key.charAt(0) === '_' && doc.hasOwnProperty(key)) {
      data[key] = doc[key];
    }
  }

  resp.body = JSON.stringify({ok: "updated"});
  return [data, resp];
};
