var semver = require('semver'),
    request = require('request'),
    errorCode = require('../lib/error-code');

module.exports = function maxSatisfyingVersion(req, res, next) {

  var q = req.query || {};

  if (! ('version' in q)) {
    return next();
  }

  //handle range query
  var id = req.params.id.split('@')[0];

  //get all the versions of the pkg
  request.get({url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'all/' + id, json: true}, function(err, resp, body) {
    if (err) return next(err);
    if (resp.statusCode >= 400) return next(errCode(body, resp.statusCode));

    if (!body.rows.length) { //<- no versions
      next();
    }

    var versions = body.rows
          .filter(function(row) {
            return ('version' in row.value);
          })
          .map(function(row) {
            return row.value.version;
          });

    if (!versions.length) {
      return next(errorCode('no version could be find for the document', 404));
    }

    var version;
    var isSemver = versions.every(function(v) { return semver.valid(v); });
    if (isSemver) {
      version = semver.maxSatisfying(versions, q.version);
    } else { //sort lexicographicaly
      version = versions.sort().reverse()[0];
    }

    if (!version) {
      return next(errorCode('no version could satisfy the range ' + q.version, 404));
    }

    req.version = version;

    next();
  });

};
