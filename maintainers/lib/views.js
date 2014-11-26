var views = exports;

views.permissions = {
  map: function(doc) {
    doc.roles
      .filter(function(role) {
        return role.charAt(0) !== '_' && (role.split('@')[1] || '').indexOf('w') !== -1;
      })
      .forEach(function (role) {
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

        var splt = role.split('@');
        var ns = splt[0];
        var permissions = splt[1] || '';

        for (var i = 0; i<permissions.length; i++) {
          emit([ns, permissions[i]], value);
        }
      });
  },
  reduce: "_count"
};

views.byEmail = {
  map: function(doc) {
    if (doc.email) {
      emit(doc.email.replace(/^mailto:/, ''), doc['@id']);
    }
  },
  reduce: "_count"
};
