var SchemaOrgIo = require('schema-org-io');

var packager = new SchemaOrgIo();

module.exports = function validate(req, res, next) {
  var cdoc = req.cdoc;

  try {
    packager.validate(cdoc);
  } catch (e) {
    return next(e);
  }

  next();
};
