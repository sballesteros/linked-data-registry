var fs = require('fs');

exports.validate = fs.readFileSync(require.resolve('npm-user-validate'), 'utf8');
