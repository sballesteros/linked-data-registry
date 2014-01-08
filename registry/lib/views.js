var views = exports;
var modules = require("./modules.js");

var paddedSemver = modules['padded-semver'];

//discusting hack...
var paddedSemverPatched = paddedSemver.replace("require('semver')", "require('views/lib/semver')", 'g');

views.lib = {
  semver: modules.semver,
  paddedSemver: paddedSemverPatched
},

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


//TODO remove @type
views.byKeyword = {
  map: function (doc) {

    var objTop = { _id: doc._id, description: '[' + doc['@type'] + '] ' + doc.name + (('description' in doc) ? ': ' + doc.description : '') };

    doc.name.trim().toLowerCase().split('-').forEach(function(n){
      emit(n, objTop);
    });
    
    if('resources' in doc){
      doc.resources.forEach(function(r) {      
        if('@type' in r){
          var objr = { _id: doc._id, description: '[' + r['@type'] + '] ' + doc.name + '/' + r.name  + (('description' in r) ? ': ' + r.description : '') };

          if (typeof r['@type'] === 'string'){
            emit(r['@type'], objr);
          } else if (Array.isArray(r['@type'])){
            r['@type'].forEach(function (t) {
              emit(t, objr);              
            });
          }
        }
      });
    }

    if('keywords' in doc){
      doc.keywords.forEach(function(kw) {
        emit(kw.trim().toLowerCase(), objTop);
      });
    }

  },
  
  reduce: "_count"
};
