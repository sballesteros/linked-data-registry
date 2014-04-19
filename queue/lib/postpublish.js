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
      processCode(conf, pkg, msg.rev, function(err, pkg, rev){
        if(err) console.error(err);
        processArticle(conf, pkg, msg.rev, function(err, pkg, rev){
          if(err) console.error(err);
          processFigure(conf, pkg, msg.rev, function(err, pkg, rev){
            if(err) console.error(err);

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

    var d = r.distribution;

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
            return cb(null);
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

          r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});
          cb(null);
        });
      });

    } else {

      r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});
      cb(null);

    }

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

    var d = r.targetProduct;

    if('filePath' in d && '_attachments' in pkg){
      var basename = path.basename(d.filePath);

      //if absolute path || bundlePath: delete (use for codeBundle created by ldc for instance)
      var normal = path.normalize(d.filePath);
      var absolute = path.resolve(d.filePath);
      if ( (normal === absolute) || d.bundlePath ) {
        delete d.filePath;
      };

    }
    r.contentRating = ldstars.rateResource(pjsonld.linkCode(clone(r), r.name, r.version), pkg.license, {string:true});
  });

  callback(null, pkg, rev);

};


/**
 * might be async one day hence the callback
 */
function processArticle(conf, pkg, rev, callback){
  var article = pkg.article || [];
  article.forEach(function(r){
    if(!r.encoding) return;
    r.contentRating = ldstars.rateResource(pjsonld.linkArticle(clone(r), r.name, r.version), pkg.license, {string:true});
  });

  callback(null, pkg, rev);
};


/**
 * create thubnails and store them as attachments
 */
function processFigure(conf, pkg, rev, callback){

  var figure = pkg.figure || [];
  var cnt = 0;

  _thumbnail(figure, cnt, rev, conf.rootCouchRegistry, conf.admin, conf.s3, pkg, callback);

};


/**
 * recursively thumbnail figures (has to be sequential so that latest _rev is passed to couch)
 */
function _thumbnail(figures, cnt, rev, rootCouchRegistry, admin, s3, pkg, callback){

  if(!figures.length){
    return callback(null, pkg, rev);
  }

  var r = figures[cnt];

  function _next(rev){
    if (++cnt < figures.length) {
      return _thumbnail(figures, cnt, rev, rootCouchRegistry, admin, s3, pkg, callback);
    } else {
      return callback(null, pkg, rev);
    }
  }

  if ('contentUrl' in r) {

    var sha1 = sutil.getSha1(r.contentUrl);

    if (sha1) {
      var s3Stream = s3.getObject({Key: sha1}).createReadStream();
      s3Stream.on('error', function(err){
        console.error(err);
      });

      gm(s3Stream).size({bufferStream: true}, function (err, size) {

        if (err) return _next(rev);

        r.width = size.width + 'px';
        r.height = size.height + 'px';
        r.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(r), r.name, r.version), pkg.license, {string:true});
        this.resize('256', '256')
        this.stream(function (err, stdout, stderr) {
          if (err) return _next(rev);

          var ropts = {
            url: rootCouchRegistry + '/' + encodeURIComponent(pkg.name + '@' + pkg.version) + '/thumb-' + r.name + '-' + '256' + '.' + mime.extension(r.encodingFormat),
            method: 'PUT',
            headers:{
              'Content-Type': r.encodingFormat,
              'If-Match': rev
            },
            auth: admin
          };

          var rthumb = request(ropts, function(err, resp, body){
            if(err) return _next(rev);

            if (resp.statusCode === 201) {
              body = JSON.parse(body);

              r.thumbnailUrl = pkg.name + '/' + pkg.version + '/thumbnail/thumb-' + r.name + '-' + '256' + '.' + mime.extension(r.encodingFormat);

              return _next(body.rev);

            } else {

              return _next(rev);

            }

          });
          stdout.pipe(rthumb);
        });
      });
    }

  } else {

    r.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(r), pkg.name, pkg.version), pkg.license, {string:true});
    return _next(rev);

  }

};
