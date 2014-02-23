var views = exports;

views.maintainers = {
  map: function (doc) {
    doc.roles
      .filter(function(x) {return x.charAt(0) !== '_';})
      .forEach(function (ctnr) {
        emit(ctnr, {name: doc.name, email: doc.email});
      });
  }, 
  reduce: "_count"
};
