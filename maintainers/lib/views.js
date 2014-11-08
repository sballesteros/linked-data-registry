var views = exports;

views.maintainers = {
  map: function (doc) {
    doc.roles
      .filter(function(x) {return x.charAt(0) !== '_';})
      .forEach(function (namespace) {
        var value = {
          _id: doc._id,
          name: doc.name,
          email: doc.email
        };

        ['givenName', 'familyName'].forEach(function(p){
          if (doc[p]) {
            value[p] = doc[p];
          }
        });

        emit(namespace, value);
      });
  },
  reduce: "_count"
};
