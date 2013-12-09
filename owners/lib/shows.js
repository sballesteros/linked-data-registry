var shows = exports;

shows.maintains = function(doc,req){

  return {
    headers : {"Content-Type":"application/json"},
    body : JSON.stringify(doc.maintains)
  };

};
