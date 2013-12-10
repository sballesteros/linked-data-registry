var fs = require('fs');

exports.tv4 = fs.readFileSync(require.resolve('tv4'), 'utf8');
exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8');
exports['padded-semver'] = fs.readFileSync(require.resolve('padded-semver'), 'utf8');
exports['dpkg-util'] =
  [ 'exports.urlify = urlify',
    function urlify(dpkg, req){
      //replace resources data or path with an url from the registry serving this resource data      
      dpkg.resources.forEach(function(r){

        if( ('data' in r) || ('path' in r) ){
          r.url = 'http://' + req.headers.Host + '/resource/' + dpkg.name + '/' + dpkg.version + '/' + r.name;
          delete r.data;
          delete r.path;
        } else if('require' in r){
          r.url = 'http://' + req.headers.Host + '/resource/' + r.require.datapackage + '/' + dpkg.dataDependencies[r.require.datapackage] + '/' + r.require.resource;
        }

      });      
      return dpkg;
    },

    'exports.clean = clean',
    function clean(dpkg){      
      delete dpkg._id; 
      delete dpkg._rev;
      delete dpkg._revisions;
      delete dpkg._attachments;
      delete dpkg.username;
    },

    'exports.extname = extname',
    function extname(filename) {
      var i = filename.lastIndexOf('.');
      return (i < 0) ? '' : filename.substr(i);
    }    
  ].map(function (s) { return s.toString() + ';' }).join('\n');
