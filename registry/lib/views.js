var views = exports;
var modules = require("./modules.js");

var paddedSemver = modules['padded-semver'];

//discusting hack...
var paddedSemverPatched = paddedSemver.replace("require('semver')", "require('views/lib/semver')", 'g');

views.lib = {
  semver: modules.semver,
  paddedSemver: paddedSemverPatched
  'is-url': modules['is-url'],
};


views.byName = {
  map: function(doc){
    emit(doc.name, { _id: doc._id, name: doc.name, version: doc.version, description: (('description' in doc) ? doc.description : '') } );
  },
  reduce: '_count'
};


views.byNameAndVersion = {
  map: function(doc){
    emit([doc.name, require('views/lib/paddedSemver').pad(doc.version)], {_id: doc._id, name: doc.name, version: doc.version, description: (('description' in doc) ? doc.description : '') } );
  },
  reduce: '_count'
};


views.byKeyword = {
  map: function (doc) {

    var objTop = { _id: doc._id, name: doc.name, description: doc.description || '' };

    doc.name.trim().toLowerCase().split('-').forEach(function(n){
      emit(n, objTop);
    });

    if('keywords' in doc){
      doc.keywords.forEach(function(kw) {
        emit(kw.trim().toLowerCase(), objTop);
      });
    }

  },

  reduce: "_count"
};


/**
 * useful to know if we can delete the resource
 */
views.bySha1 = {
  map: function(doc){
    emit([doc.name, require('views/lib/paddedSemver').pad(doc.version)], {_id: doc._id, name: doc.name, version: doc.version, description: (('description' in doc) ? doc.description : '') } );
  },
  reduce: '_count'
};
