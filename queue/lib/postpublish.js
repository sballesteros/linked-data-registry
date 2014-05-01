var util = require('util')
  , isUrl = require('is-url')
  , fs = require('fs')
  , path = require('path')
  , request = require('request')
  , crypto = require('crypto')
  , async = require('async')
  , mime = require('mime')
  , url = require('url')
  , pjsonld = require('package-jsonld')
  , gm = require('gm')
  , zlib = require('zlib')
  , clone = require('clone')
  , concat = require('concat-stream')
  , sutil = require('../../proxy/lib/util')
  , previewTabularData = require('preview-tabular-data').preview
  , ldstars = require('ldstars');

/**
 * post publish
 * modifies pkg in place
 */
module.exports = function(conf, msg, callback){

  request( { url: conf.rootCouchRegistry + '/' + msg.id }, function(err, resp, pkg){

    if(err) return callback(err);
    if (resp.statusCode >= 400){
      return callback(sutil.errorCode('oops something went wrong when trying to GET ' + msg.id, resp.statusCode));
    }
    pkg = JSON.parse(pkg);

    processDataset(conf, pkg, msg.rev, function(err, pkg, rev){
      if(err) console.error(err);
      processCode(conf, pkg, rev, function(err, pkg, rev){
        if(err) console.error(err);
        processArticle(conf, pkg, rev, function(err, pkg, rev){
          if(err) console.error(err);
          processFigure(conf, pkg, rev, function(err, pkg, rev){
            if(err) console.error(err);

            //TODO Audio and Video

            pkg.contentRating = ldstars.rate(pjsonld.linkPackage(clone(pkg)), {string:true});
            callback(err, pkg, rev);

          });
        });
      });
    });
  });

};

/**
 * store contentData on S3 and rate
 */
function processDataset(conf, pkg, rev, callback){

  var dataset = pkg.dataset || [];
  async.eachSeries(dataset, function(r, cb){

    if(!r.distribution) return cb(null);

    r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});

    async.eachSeries(r.distribution, function(d, cb2){

      if('contentData' in d){

        var s = (typeof d.contentData === 'string') ? d.contentData: JSON.stringify(d.contentData);

        var format;
        if( typeof d.encodingFormat === 'string' ){
          format =  d.encodingFormat; //trust user ??? would be good to validate
        } else {
          format = (typeof d.contentData === 'string') ? 'text/plain':
            (s.indexOf('@context') !== -1) ? 'application/ld+json' : 'application/json';
        }

        d.contentSize = Buffer.byteLength(s, 'utf-8');
        d.encodingFormat = format;
        d.hashAlgorithm = 'sha1';
        d.hashValue = crypto.createHash('sha1').update(s).digest('hex');

        //put to S3
        zlib.gzip(s, function(errGzip, dataGzip){
          if(errGzip) console.error(errGzip);

          var opts = {
            Key: (errGzip) ? d.hashValue: crypto.createHash('sha1').update(dataGzip).digest('hex'),
            Body: (errGzip) ? s: dataGzip,
            ContentType: format,
            ContentLength: (errGzip) ? d.contentSize: dataGzip.length
          };

          if(!errGzip){
            opts.ContentEncoding = 'gzip';
          }

          conf.s3.putObject(opts, function(errS3, resS3){
            if(errS3) {
              console.error(errS3);
              r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});
              return cb2(null);
            }

            d.contentUrl = 'r/' + opts.Key;

            if(!errGzip){
              d.encoding = {
                contentSize: opts.ContentLength,
                encodingFormat: 'gzip',
                hashAlgorithm: 'sha1',
                hashValue: opts.Key
              };
            }

            cb2(null);
          });
        });

      } else if('contentUrl' in d) {

        //only preview once.
        if(r.preview){
          return cb2(null);
        }

        if(d.encodingFormat && ['application/x-ldjson', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv','text/tab-separated-values'].indexOf(d.encodingFormat) === -1){
          return cb2(null);
        }

        sutil.stream(d.contentUrl, conf.s3, function(err, streamContent){

          if(err){
            console.error(err);
            return cb2(null);
          }

          //preview if tabular data
          previewTabularData(streamContent.readable, {
            'content-type': streamContent.ContentType || d.encodingFormat || 'application/octet-stream',
            'content-length': streamContent.ContentLength,
            'content-encoding':streamContent.ContentEncoding
          }, {nPreview: 10}, function(err, preview){
            if(err) return cb2(null);

            if(preview){
              r.preview = preview
            }
            cb2(null);
          });

        });

      } else {
        cb2(null);
      }

    }, cb);

  }, function(err){
    return callback(err, pkg, rev);
  });

};


/**
 * might be async one day hence the callback
 */
function processCode(conf, pkg, rev, callback){

  var code = pkg.code || [];
  code.forEach(function(r){
    if(!r.targetProduct) return;

    r.targetProduct.forEach(function(d){
      if('filePath' in d && '_attachments' in pkg){
        var basename = path.basename(d.filePath);

        //if absolute path || bundlePath: delete (use for codeBundle created by ldc for instance)
        var normal = path.normalize(d.filePath);
        var absolute = path.resolve(d.filePath);
        if ( (normal === absolute) || d.bundlePath ) {
          delete d.filePath;
        };
      }
    });

    r.contentRating = ldstars.rateResource(pjsonld.linkCode(clone(r), r.name, r.version), pkg.license, {string:true});
  });

  callback(null, pkg, rev);
};


/**
 * create thumbnail of the first page of the pdf (if any)
 */
function processArticle(conf, pkg, rev, callback){

  var article = pkg.article || [];
  var cnt = 0;

  _thumbnailArticle(article, cnt, rev, conf.rootCouchRegistry, conf.admin, conf.s3, pkg, callback);
};

/**
 * recursively thumbnail articles (has to be sequential so that latest _rev is passed to couch)
 */
function _thumbnailArticle(articles, cnt, rev, rootCouchRegistry, admin, s3, pkg, callback){

  if(!articles.length){
    return callback(null, pkg, rev);
  }

  var r = articles[cnt];

  function _next(rev){
    if (++cnt < articles.length) {
      return _thumbnailArticle(articles, cnt, rev, rootCouchRegistry, admin, s3, pkg, callback);
    } else {
      return callback(null, pkg, rev);
    }
  }

  if ('encoding' in r) {
    r.contentRating = ldstars.rateResource(pjsonld.linkArticle(clone(r), pkg.name, pkg.version), pkg.license, {string:true});

    //find an encoding in PDF AND having a contentUrl
    var enc = r.encoding.filter(function(x){
      return ('contentUrl' in r.encoding) && (r.encoding.encodingFormat === 'application/pdf' );
    })[0];

    if(!enc){
      return _next(rev);
    }

    sutil.dereference(enc.contentUrl, s3, function(err, data){
      if(err) {
        console.error(err);
        return _next(rev);
      }

      gm(data.Body, 'article.pdf[0]')
        .resize(400, 400)
        .toBuffer('png', function (err, buffer) {
          if (err) return _next(rev);

          var contentType = 'image/png';
          var thumbnailName = 'thumb-' + r.name + '-' + '400' + '.' + mime.extension(contentType);

          var ropts = {
            url: rootCouchRegistry + '/' + encodeURIComponent(pkg.name + '@' + pkg.version) + '/' + thumbnailName,
            method: 'PUT',
            headers:{
              'Content-Length': buffer.length,
              'Content-Type': contentType,
              'If-Match': rev
            },
            auth: admin,
            body: buffer
          };

          request(ropts, function(err, resp, body){
            if(err) return _next(rev);

            if (resp.statusCode === 201) {
              body = JSON.parse(body);

              r.thumbnailUrl = pkg.name + '/' + pkg.version + '/thumbnail/' + thumbnailName;

              return _next(body.rev);

            } else {

              return _next(rev);

            }
          });

        });

    });

  } else {
    return _next(rev);
  }

};




/**
 * create thubnails and store them as attachments
 */
function processFigure(conf, pkg, rev, callback){

  var figure = pkg.figure || [];
  var cnt = 0;

  _thumbnailFigure(figure, cnt, rev, conf.rootCouchRegistry, conf.admin, conf.s3, pkg, callback);

};


/**
 * recursively thumbnail figures (has to be sequential so that latest _rev is passed to couch)
 */
function _thumbnailFigure(figures, cnt, rev, rootCouchRegistry, admin, s3, pkg, callback){

  if(!figures.length){
    return callback(null, pkg, rev);
  }

  var r = figures[cnt];

  function _next(rev){
    if (++cnt < figures.length) {
      return _thumbnailFigure(figures, cnt, rev, rootCouchRegistry, admin, s3, pkg, callback);
    } else {
      return callback(null, pkg, rev);
    }
  }

  if('figure' in r){
    r.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(r), pkg.name, pkg.version), pkg.license, {string:true});

    _thumbnailImage(r, cnt, rev, rootCouchRegistry, admin, s3, pkg, _next);

  } else {
    return _next(rev);
  }

};


function _thumbnailImage(figure, cnt, rev, rootCouchRegistry, admin, s3, pkg, next){

  if(!figure.figure){
    return next(rev);
  }

  var img = figure.figure[cnt];

  function _next(rev){
    if(++cnt < figure.figure.length) {
      return _thumbnailImage(figure, cnt, rev, rootCouchRegistry, admin, s3, pkg, next);
    } else {
      return next(rev);
    }
  }

  if(img.contentUrl){

    sutil.dereference(img.contentUrl, s3, function(err, data){
      if(err) {
        console.error(err);
        return _next(rev);
      }

      gm(data.Body)
        .size(function (err, size) {

          if (err) return _next(rev);

          img.width =  { value: size.width,  unitCode: 'E37', description: size.width + 'px'  };
          img.height = { value: size.height, unitCode: 'E37', description: size.height + 'px' };

          if(figure.thumbnailUrl){
            return _next(rev);
          }
          //if not try to generate a thumbnail

          if(size.width > 400 || size.height > 400){
            this.resize('400', '400')
          }

          this.toBuffer('png', function (err, buffer) {

            if (err) return _next(rev);

            var contentType = 'image/png';
            var thumbnailName = 'thumb-' + figure.name + '-' + '400' + '.' + mime.extension(contentType);

            var ropts = {
              url: rootCouchRegistry + '/' + encodeURIComponent(pkg.name + '@' + pkg.version) + '/' + thumbnailName,
              method: 'PUT',
              headers:{
                'Content-Length': buffer.length,
                'Content-Type': contentType,
                'If-Match': rev
              },
              auth: admin,
              body: buffer
            };

            request(ropts, function(err, resp, body){
              if(err) return _next(rev);

              if (resp.statusCode === 201) {
                body = JSON.parse(body);

                figure.thumbnailUrl = pkg.name + '/' + pkg.version + '/thumbnail/' + thumbnailName;

                return _next(body.rev);

              } else {

                return _next(rev);

              }
            });

          });
        });
    });

  } else {
    return _next(rev);
  }

};
