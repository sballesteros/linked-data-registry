var fs = require('fs');

//want to use url and package-jsonld in couchdb => install all the deps.
exports.punycode = fs.readFileSync(require.resolve('../../node_modules/url/node_modules/punycode'), 'utf8');
exports.querystring = fs.readFileSync(require.resolve('../../node_modules/url/node_modules/querystring'), 'utf8');
exports.url = fs.readFileSync(require.resolve('../../node_modules/url'), 'utf8');
exports['is-url'] = fs.readFileSync(require.resolve('is-url'), 'utf8');

exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8');

//exports['package-jsonld'] = fs.readFileSync(require.resolve('package-jsonld'), 'utf8');
exports['padded-semver'] = fs.readFileSync(require.resolve('padded-semver'), 'utf8');

exports['proxy'] = [
  'exports.host = "HOST";'.replace('HOST', process.env['NODE_HOST']),
  'exports.port = "PORT";'.replace('PORT', process.env['NODE_PORT']),
  'exports.portHttps = "PORT_HTTPS";'.replace('PORT_HTTPS', process.env['NODE_PORT_HTTPS']),
].join('\n');

exports['couch'] = 'exports.name = "NAME";'.replace('NAME', process.env['REGISTRY_DB_NAME'] || 'registry'),

exports['for-each-node'] = [
  'module.exports = _forEachNode',
  function _forEachNode(doc, callback){
    for (var prop in doc) {
      if (prop === '@context' || !doc.hasOwnProperty(prop)) continue;

      if (Array.isArray(doc[prop])) {
        for (var i=0; i<doc[prop].length; i++) {
          if (typeof doc[prop][i] === 'object') {
            callback(prop, doc[prop][i]);
            _forEachNode(doc[prop][i], callback);
          }
        }
      } else if (typeof doc[prop] === 'object') {
        callback(prop, doc[prop]);
        _forEachNode(doc[prop], callback);
      }
    }
  }
].map(function (s) { return s.toString() + ';' }).join('\n');


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
    function clean(doc){
      delete doc._id;
      delete doc._rev;
      delete doc._revisions;
      delete doc._attachments;
      delete doc.latest;

      return doc;
    },

    'exports.extname = extname',
    function extname(filename) {
      var i = filename.lastIndexOf('.');
      return (i < 0) ? '' : filename.substr(i);
    }
  ].map(function (s) { return s.toString() + ';' }).join('\n');
