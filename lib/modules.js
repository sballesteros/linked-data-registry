var fs = require('fs');

exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8');
exports['padded-semver'] = fs.readFileSync(require.resolve('padded-semver'), 'utf8');

