var fs = require('fs');

exports.tv4 = fs.readFileSync(require.resolve('tv4'), 'utf8');
exports.semver = fs.readFileSync(require.resolve('semver'), 'utf8');
exports['padded-semver'] = fs.readFileSync(require.resolve('padded-semver'), 'utf8');


