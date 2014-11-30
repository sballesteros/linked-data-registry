var jsonld = require('jsonld'),
    SchemaOrgIo = require('schema-org-io');

module.exports = function compact(req, res, next) {
  var doc = req.body;
  var ctxUrl = req.proxyUrl; //to facilitate testing on localhost

  var ctx;
  if (doc['@context'] === SchemaOrgIo.contextUrl) {
    ctx = doc['@context'];
    doc['@context'] = ctxUrl;
  }

  jsonld.compact(doc, ctxUrl, function(err, cdoc) {
    if(err) return next(err);

    if (ctx && cdoc['@context'] === ctxUrl) {
      cdoc['@context'] = ctx;
    }

    req.cdoc = cdoc;
    next();
  });
};
