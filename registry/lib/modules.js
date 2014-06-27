var fs = require('fs');

//want to use url and datapackage-jsonld in couchdb => install all the deps.
//TODO find a better way to do this, this is hacky and shitty
exports.punycode = fs.readFileSync(require.resolve('../../node_modules/url/node_modules/punycode'), 'utf8');
exports.querystring = fs.readFileSync(require.resolve('../../node_modules/url/node_modules/querystring'), 'utf8');
exports.url = fs.readFileSync(require.resolve('../../node_modules/url'), 'utf8');
exports['is-url'] = fs.readFileSync(require.resolve('is-url'), 'utf8');

exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8');

exports.tv4 = fs.readFileSync(require.resolve('tv4'), 'utf8') + '\n'; //note the '\n' (fuck my life)
exports['package-jsonld'] = fs.readFileSync(require.resolve('package-jsonld'), 'utf8');
exports['padded-semver'] = fs.readFileSync(require.resolve('padded-semver'), 'utf8');


exports['proxy'] = [
  'exports.host = "HOST";'.replace('HOST', process.env['NODE_HOST']),
  'exports.port = "PORT";'.replace('PORT', process.env['NODE_PORT']),
  'exports.portHttps = "PORT_HTTPS";'.replace('PORT_HTTPS', process.env['NODE_PORT_HTTPS']),
].join('\n');

exports['couch'] = 'exports.name = "NAME";'.replace('NAME', process.env['REGISTRY_DB_NAME'] || 'registry'),


exports['pkg-util'] =
  [ 'exports.root = root',
    'var couch = require("couch")',
    function root(req){
      //hacky: TO BE IMPROVED
      var protocol = (req.query.secure) ? 'https' : 'http';
      if(req.headers.Host.split(':')[1] == 443){
        protocol = 'https';
      }
      return protocol + '://' + req.headers.Host + '/' + couch.name;
    },

    'exports.resolveProxy = resolveProxy',
    'var isUrl = require("is-url")',
    'var url = require("url")',
    'var proxy = require("proxy")',
    function resolveProxy(req, uri){
      if(isUrl(uri)){
        return uri;
      }

      var protocol = (req.query.secure) ? 'https' : 'http';
      if(req.headers.Host.split(':')[1] == 443){
        protocol = 'https';
      }
      var base = protocol + '://' + proxy.host + ':' + ((protocol === 'http')? proxy.port : proxy.portHttps);

      return url.resolve(base, uri);
    },

    'exports.clean = clean',
    function clean(pkg, req){
      delete pkg._id;
      delete pkg._rev;
      delete pkg._revisions;
      delete pkg._attachments;

      if(! req.query.contentData){
        if('dataset' in pkg){
          pkg.dataset.forEach(function(d){
            if(d.distribution){
              d.distribution.forEach(function(x){
                delete x.contentData;
              });
            }
          });
        }
      }

      return pkg;
    },

    'exports.extname = extname',
    function extname(filename) {
      var i = filename.lastIndexOf('.');
      return (i < 0) ? '' : filename.substr(i);
    }
  ].map(function (s) { return s.toString() + ';' }).join('\n');
