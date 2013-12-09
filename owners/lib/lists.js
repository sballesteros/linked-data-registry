var lists = exports;

lists.maintainers = function(head, req){

  var maintainers = [];
  var row;
  while (row = getRow()) {
    maintainers.push(row.value);
  }

  start({"headers": {"Content-Type": "application/json"}});
  send(JSON.stringify(maintainers));
};
