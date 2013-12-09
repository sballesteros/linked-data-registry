var lists = exports;

lists.maintainers = function(head, req){

  var maintainers = [];
  var row;
  while (row = getRow()) {
    maintainers.push(row.value);
  }

  if(!maintainers.length){
    start({ code: 404 })
    return send(JSON.stringify({error:"not found"}));    
  }

  start({"headers": {"Content-Type": "application/json"}});
  send(JSON.stringify(maintainers));
};
