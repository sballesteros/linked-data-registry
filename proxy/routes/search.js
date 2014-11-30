var router = require('express').Router({caseSensitive: true}),
    request = require('request'),
    async = require('async'),
    SchemaOrgIo = require('schema-org-io'),
    errorCode = require('../lib/error-code'),
    oboe = require('oboe');

router.get('/', function(req, res, next) {
  var keywords = req.query.keywords || [];
  keywords = (Array.isArray(keywords)? keywords : [keywords])
    .map(function(x) {return x.trim().toLowerCase()})
    .filter(function(x) {return x;});

  if (!keywords.length) {
    return next(errorCode('keywords querystring parameter(s) needed', 400));
  }

  //take the request with the smallest number of results
  async.sortBy(keywords, function(kw, cb) {
    request.get({url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'search?reduce=true&group=true&key="' + kw +'"', json:true}, function(err, resp, body) {
      if (err) return cb (err);
      if (resp.statusCode >= 400) return cb(errorCode(body, resp.statusCode));
      if (!body.rows.length) return cb(errorCode('no results', 404));
      return cb(null, body.rows[0].value);
    });

  }, function(err, sortedKw) {
    if (err) return next(err);

    var r = request.get({url: req.app.get('ROOT_COUCH_REGISTRY_RW') + 'search?reduce=false&key="' + sortedKw[0] +'"', json:true});
    r.on('error', next);
    r.on('response', function(resp) {
      //filter results that match all the other kw and stream a JSON-LD response
      var isFirst = true;
      oboe(resp)
        .start(function(status, headers) {
          res.set('Content-Type', 'application/ld+json');
        })
        .node('rows.*', function(row) {
          if (isFirst) {
            res.write(['{',
                       '"@context": "' + SchemaOrgIo.contextUrl + '",',
                       '"@type": "ItemList",',
                       '"itemListOrder": "Unordered",',
                       '"itemListElement": ['
                      ].join(''));
            isFirst = false;
          } else {
            res.write(',');
          };
          delete row.value._id;
          res.write(JSON.stringify(row.value));
        })
        .done(function() {
          res.write(']}');
          res.end();
        })
        .fail(function(errorReport) {
          if (errorReport.thrown) {
            next(errorReport.thrown);
          } else {
            next(errorCode(errorReport.jsonBody, errorReport.statusCode));
          }
        });
    });

  });

});


module.exports = router;
