var views = exports;

views.maintainers = {
  map: function (doc) {
    doc.roles
      .filter(function(x) {return x.charAt(0) !== '_';})
      .forEach(function (namespace) {
        emit(namespace, {name: doc.name, email: doc.email});
      });
  },
  reduce: "_count"
};
