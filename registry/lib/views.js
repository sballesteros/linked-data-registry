var views = exports;
var modules = require("./modules.js");

//discusting hack...
views.lib = {
  semver: modules.semver,
  paddedSemver: modules['padded-semver'].replace("require('semver')", "require('views/lib/semver')", 'g'),  //discusting hack...
  punycode: modules['punycode'],
  querystring: modules['querystring'],
  'is-url': modules['is-url'],
  url: modules['url']
    .replace("require('punycode')", "require('views/lib/punycode')", 'g')
    .replace("require('querystring')", "require('views/lib/querystring')", 'g')
};


views.byName = {
  map: function(doc){
    emit(doc.name, { _id: doc._id, name: doc.name, version: doc.version, private: doc.private, description: (('description' in doc) ? doc.description : '') } );
  },
  reduce: '_count'
};


views.byNameAndVersion = {
  map: function(doc){
    emit([doc.name, require('views/lib/paddedSemver').pad(doc.version)], {_id: doc._id, name: doc.name, version: doc.version, private: doc.private, description: (('description' in doc) ? doc.description : '') } );
  },
  reduce: '_count'
};


views.byKeyword = {
  map: function (doc) {

    var objTop = { _id: doc._id, name: doc.name, private: doc.private, description: doc.description || '' };

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
    var isUrl = require('views/lib/is-url');
    var url = require('views/lib/url');

    function getSha1(uri){
      if(!isUrl(uri)){
        return uri.replace(/^\/|\/$/g, '').split('/')[1];
      } else {
        purl = url.parse(uri);
        if(purl.hostname === 'registry.standardanalytics.io'){
          return purl.pathname.replace(/^\/|\/$/g, '').split('/')[1];
        }
      }
      return undefined;
    };


    (doc.dataset || []).forEach(function(r){
      if(r.distribution){
        r.distribution.forEach(function(x){
          if(x.contentUrl){
            var sha1 = getSha1(x.contentUrl);
            if(sha1){
              emit(sha1, { _id: doc._id, private: doc.private } );
            }
          }
        });
      }
    });

    (doc.sourceCode || []).forEach(function(r){
      if(r.targetProduct && r.targetProduct.downloadUrl){
        r.targetProduct.downloadUrl.forEach(function(x){
          if(x.downloadUrl){
            var sha1 = getSha1(x.downloadUrl);
            if(sha1){
              emit(sha1, { _id: doc._id, private: doc.private } );
            }
          }
        });
      }
    });

    ['article', 'image', 'audio', 'video'].forEach(function(mediaType){
      (doc[mediaType] || []).forEach(function(r){
        if(r[mediaType]){
          r.encoding.forEach(function(x){
            if(x.contentUrl){
              var sha1 = getSha1(r.contentUrl);
              if(sha1){
                emit(sha1, { _id: doc._id, private: doc.private } );
              }
            }
          });
        }
      });
    });

  },
  reduce: '_count'
};
