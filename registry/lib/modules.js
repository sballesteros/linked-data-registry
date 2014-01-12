var fs = require('fs')
  , path = require('path');


//want to use url and datapackage-jsonld in couchdb => install all the deps.
//TODO find a better way to do this, this is hacky and shitty
exports.punycode = fs.readFileSync(require.resolve('../../node_modules/url/node_modules/punycode'), 'utf8');
exports.querystring = fs.readFileSync(require.resolve('../../node_modules/url/node_modules/querystring'), 'utf8');
exports.url = fs.readFileSync(require.resolve('../../node_modules/url'), 'utf8');
exports['is-url'] = fs.readFileSync(require.resolve('is-url'), 'utf8');

exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8'); 

exports.tv4 = fs.readFileSync(require.resolve('tv4'), 'utf8') + '\n'; //note the '\n' (fuck my life)
exports['datapackage-jsonld'] = fs.readFileSync(require.resolve('datapackage-jsonld'), 'utf8');
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
    function clean(dpkg, req){
      delete dpkg._id; 
      delete dpkg._rev;
      delete dpkg._revisions;
      delete dpkg._attachments;

      if(! req.query.contentData){
        if('dataset' in dpkg){
          dpkg.dataset.forEach(function(d){
            if(d.distribution){
              delete d.distribution.contentData;
            }
          });
        }
      }

      return dpkg;
    },

    'exports.extname = extname',
    function extname(filename) {
      var i = filename.lastIndexOf('.');
      return (i < 0) ? '' : filename.substr(i);
    }    
  ].map(function (s) { return s.toString() + ';' }).join('\n');
