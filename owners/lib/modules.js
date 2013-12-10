var fs = require('fs');

exports.tv4 = fs.readFileSync(require.resolve('tv4'), 'utf8');
exports.validate = fs.readFileSync(require.resolve('npm-user-validate'), 'utf8');
