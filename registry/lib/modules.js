var fs = require('fs');

exports.tv4 = fs.readFileSync(require.resolve('tv4'), 'utf8') + '\n'; //note the '\n' (fuck my life)
exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8');
exports.ldpkgJsonLd = fs.readFileSync(require.resolve('datapackage-jsonld'), 'utf8');
exports['padded-semver'] = fs.readFileSync(require.resolve('padded-semver'), 'utf8');
exports['dpkg-util'] =
  [ 'exports.root = root',
    function root(req){     
      //hacky: TO BE IMPROVED
      var protocol = (req.query.secure) ? 'https' : 'http';
      if(req.headers.Host.split(':')[1] == 443){
        protocol = 'https';
      }
      return protocol + '://' + req.headers.Host;
    },

    'exports.clean = clean',
    function clean(dpkg){
      delete dpkg._id; 
      delete dpkg._rev;
      delete dpkg._revisions;
      delete dpkg._attachments;

      return dpkg;
    },

    'exports.extname = extname',
    function extname(filename) {
      var i = filename.lastIndexOf('.');
      return (i < 0) ? '' : filename.substr(i);
    }    
  ].map(function (s) { return s.toString() + ';' }).join('\n');
