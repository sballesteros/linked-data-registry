var views = exports;

views.maintainers = {
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

        emit(role.split('@')[0], value);
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

views.reviewers = {
  map: function(doc) {
    if (doc.readAccess && doc.readAccess.length) {
      doc.readAccess.forEach(function(namespace) {
        var value = {
          _id: doc._id,
          name: doc.name,
          email: doc.email
        };

        ['givenName', 'familyName'].forEach(function(p) {
          if (doc[p]) {
            value[p] = doc[p];
          }
        });

        emit(namespace, value);
      });
    }
  },
  reduce: "_count"
};
