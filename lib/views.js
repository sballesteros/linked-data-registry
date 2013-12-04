var views = exports;
var modules = require("./modules.js");

var paddedSemver = modules['padded-semver'];

//discusting hack...
var paddedSemverPatched = paddedSemver.replace("require('semver')", "require('views/lib/semver')", 'g');

views.lib = {
  semver: modules.semver,
  paddedSemver: paddedSemverPatched
},

views.byNameAndVersion = {
  map: function(doc){     
    emit([doc.name, require('views/lib/paddedSemver').pad(doc.version)], {_id: doc._id});
  },
  reduce: '_count'
};

views.byKeyword = {
  map: function (doc) {
    if (!doc.keywords) return;
    doc.keywords.forEach(function (kw) {
      emit(kw.toLowerCase(), {_id: doc._id, description: doc.description});
    });
  }, 
  reduce: "_count"
};
