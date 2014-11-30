var router = require('express').Router({caseSensitive: true}),
    SchemaOrgIo = require('schema-org-io'),
    errorCode = require('../lib/error-code'),
    sha = require('sha');

var forceAuth = require('../middlewares/force-auth');

router.put('/:sha1', forceAuth, function(req, res, next) {

  var action = {
    '@context': SchemaOrgIo.contextUrl,
    "@type": "CreateAction",
    "actionStatus": "CompletedActionStatus",
    "agent": 'ldr:users/' + req.user.name,
    "object": 'ldr:r/' + req.params.sha1
  };

  //check if the resource exists already
  req.app.get('s3').headObject({Key:req.params.sha1}, function(err, s3Headers) {
    if (!err) {
      if (s3Headers.ContentLength) { res.set('Content-Length', s3Headers.ContentLength); }
      if (s3Headers.ContentType) { res.set('Content-Type', s3Headers.ContentType); }
      if (s3Headers.ContentEncoding) { res.set('Content-Encoding', s3Headers.ContentEncoding); }
      if (s3Headers.ETag) { res.set('ETag', s3Headers.ETag); }
      if (s3Headers.LastModified) { res.set('Last-Modified', s3Headers.LastModified); }

      return res.type('application/ld+json').status(200).json(action);
    }

    //resource is not on S3, we PUT it
    if (!req.headers['content-md5']) {
      return next(errorCode('a Content-MD5 header must be provided', 400));
    }

    var checkStream = req.pipe(sha.stream(req.params.sha1));
    var checkErr = null;

    checkStream.on('error', function(err) {
      checkErr = err;
    });

    var opts = {
      Key: req.params.sha1,
      Body: checkStream,
      ContentType: req.headers['content-type'],
      ContentLength: parseInt(req.headers['content-length'], 10),
      ContentMD5: req.headers['content-md5']
    };

    if (req.headers['content-encoding']) {
      opts['ContentEncoding'] = req.headers['content-encoding']
    }

    req.app.get('s3').putObject(opts, function(err, data) {
      if (err) return next(err);
      if (checkErr) {
        req.app.get('s3').deleteObject({Key: req.params.sha1}, function(err, data) {
          if (err) console.error(err);
          return next(checkErr);
        });
      } else {
        res.set('ETag', data.ETag);
        res.type('application/ld+json').json(action);
      }
    });

  });

});


/**
 * TODO: redirect instead ?
 * TODO: find a way to use Content-Disposition: attachment; filename=FILENAME to indicate filename...
 */
router.get('/:sha1', function(req, res, next) {

  req.app.get('s3').headObject({Key:req.params.sha1}, function(err, s3Headers) {
    if (err) return next(errorCode(err.code, err.statusCode));

    if (s3Headers.ContentLength) { res.set('Content-Length', s3Headers.ContentLength); }
    if (s3Headers.ContentType) { res.set('Content-Type', s3Headers.ContentType); }
    if (s3Headers.ContentEncoding) { res.set('Content-Encoding', s3Headers.ContentEncoding); }
    if (s3Headers.ETag) { res.set('ETag', s3Headers.ETag); }
    if (s3Headers.LastModified) { res.set('Last-Modified', s3Headers.LastModified); }

    var s = req.app.get('s3').getObject({Key:req.params.sha1}).createReadStream();
    s.on('error', function(err) { console.error(err); });
    s.pipe(res);
  });

});




module.exports = router;
