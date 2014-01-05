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

    var obj = { _id: doc._id, description: doc.description };

    doc.name.trim.toLowerCase().split('-').forEach(function(n){
      emit(n, obj);
    });

    
    if('resources' in doc){
      doc.resources.forEach(function(r) {      
        if('@type' in r){
          if (typeof r['@type'] === 'string'){
            emit(r['@type'], obj);
          } else if (Array.isArray(r['@type'])){
            r['@type'].forEach(function (t) {
              emit(t, obj);              
            });
          }
        }
      });
    }

    if('keywords' in doc){
      doc.keywords.forEach(function(kw) {
        emit(kw.trim().toLowerCase(), obj);
      });
    }

  },
    
  reduce: "_count"
};
