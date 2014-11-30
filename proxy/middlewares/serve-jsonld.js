var jsonld = require('jsonld'),
    SchemaOrgIo = require('schema-org-io');

/**
 * see http://json-ld.org/spec/latest/json-ld/#iana-considerations
 */
module.exports = function serveJsonld(req, res, next) {
  var cdoc = req.cdoc;

  var ctxUrl = req.proxyUrl; //to facilitate testing on localhost
  var ctx;
  if (cdoc['@context'] === SchemaOrgIo.contextUrl) {//context transfo to help for testing
    ctx = cdoc['@context'];
    cdoc['@context'] = ctxUrl;
  }

  function _next(err, pdoc) {
    if (err) return next(err);

    //reverse @context transfo
    if (ctx && pdoc['@context'] === ctxUrl) {
      pdoc['@context'] = ctx;
    }

    res.json(pdoc);
  };

  switch(req.accepts('application/json', 'application/ld+json', 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"', 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"', 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"')) {

  case 'application/json':
    res.set('Link', SchemaOrgIo.contextLink);
    delete cdoc['@context'];
    res.json(cdoc);
    break;

  case 'application/ld+json':
    _next(null, cdoc);
    break;

  case 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"':
    _next(null, cdoc);
    break;

  case 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"':
    jsonld.expand(cdoc, {expandContext: ctxUrl}, _next);
    break;

  case 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"':
    jsonld.flatten(cdoc, ctxUrl, _next);
    break;

  default:
    res.status(406).json({'error': 'Not Acceptable'});
    break;
  };

};
