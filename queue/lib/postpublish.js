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
            processAudio(conf, pkg, rev, function(err, pkg, rev){
              if(err) console.error(err);
              processVideo(conf, pkg, rev, function(err, pkg, rev){
                if(err) console.error(err);

                pkg.contentRating = ldstars.rate(pjsonld.linkPackage(clone(pkg)), {string:true});
                callback(err, pkg, rev);

              });
            });
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

    r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), pkg.name, pkg.version), pkg.license, {string:true});

    if(!r.distribution) return cb(null);

    async.eachSeries(r.distribution, function(d, cb2){

      if('contentData' in d){

        var s = (typeof d.contentData === 'string') ? d.contentData: JSON.stringify(d.contentData);

        var format;
        if(d.encodingFormat){
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
    r.contentRating = ldstars.rateResource(pjsonld.linkCode(clone(r), pkg.name, pkg.version), pkg.license, {string:true});
  });

  callback(null, pkg, rev);
};

/**
 * might be async one day hence the callback
 */
function processAudio(conf, pkg, rev, callback){

  var audio = pkg.audio || [];
  audio.forEach(function(r){
    r.contentRating = ldstars.rateResource(pjsonld.linkAudio(clone(r), pkg.name, pkg.version), pkg.license, {string:true});
  });

  callback(null, pkg, rev);
};


/**
 * might be async one day hence the callback
 */
function processVideo(conf, pkg, rev, callback){

  var video = pkg.video || [];
  video.forEach(function(r){
    r.contentRating = ldstars.rateResource(pjsonld.linkVideo(clone(r), pkg.name, pkg.version), pkg.license, {string:true});
  });

  callback(null, pkg, rev);
};



/**
 * create thumbnail of the first page of the pdf (if any)
 */
function processArticle(conf, pkg, rev, callback){

  var articles = pkg.article || [];

  async.eachSeries(articles, function(r, cb){
    r.contentRating = ldstars.rateResource(pjsonld.linkArticle(clone(r), pkg.name, pkg.version), pkg.license, {string:true});

    //find an encoding in PDF AND having a contentUrl
    var enc = (r.encoding || []).filter(function(x){
      return ('contentUrl' in x) && (x.encodingFormat === 'application/pdf' );
    })[0];

    //if no thumbnail has been previously assigned and one can be generated
    if (!r.thumbnailUrl && enc) {
      sutil.dereference(enc.contentUrl, conf.s3, function(err, data){
        if(err) {
          console.error(err);
          return _next(rev);
        }

        gm(Buffer.isBuffer(data.Body)? data.Body : new Buffer(data.Body) , 'article.pdf[0]')
          .resize(400, 400)
          .toBuffer('png', function (err, buffer) {
            if (err) {
              console.error(err);
              return cb(null);
            }

            var opts = {
              Key: crypto.createHash('sha1').update(buffer).digest('hex'),
              Body: buffer,
              ContentType: 'image/png',
              ContentLength: buffer.length
            };

            conf.s3.putObject(opts, function(errS3, resS3){
              if(errS3) {
                console.error(errS3);
                return cb(null);
              }

              r.thumbnailUrl = 'r/' + opts.Key;
              cb(null);
            });

          });
      });

    } else {
      cb(null);
    }

  }, function(err){

    return callback(err, pkg, rev);

  });

};


/**
 * size images, create thumbnails and store them in S3
 */
function processFigure(conf, pkg, rev, callback){

  var figures = pkg.figure || [];
  async.eachSeries(figures, function(r, cb){
    r.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(r), pkg.name, pkg.version), pkg.license, {string:true});
    
    if(!r.encoding) return cb(null);

    async.eachSeries(r.encoding, function(img, cb2){
      if(!img.contentUrl) return cb2(null);

      sutil.dereference(img.contentUrl, conf.s3, function(err, data){
        if(err) {
          console.error(err);
          return cb2(null);
        }

        //get image size
        gm(data.Body)
          .size(function (err, size) {

            if (err) return cb2(null);

            img.width =  { value: size.width,  unitCode: 'E37', description: size.width + 'px'  };
            img.height = { value: size.height, unitCode: 'E37', description: size.height + 'px' };

            if(r.thumbnailUrl){
              return cb2(null);
            }

            //thumbnail

            if(size.width > 400 || size.height > 400){
              this.resize('400', '400')
            }

            this.toBuffer('png', function (err, buffer) {

              if (err) return cb2(rev);

              var opts = {
                Key: crypto.createHash('sha1').update(buffer).digest('hex'),
                Body: buffer,
                ContentType: 'image/png',
                ContentLength: buffer.length
              };

              conf.s3.putObject(opts, function(errS3, resS3){
                if(errS3) {
                  console.error(errS3);
                  return cb2(null);
                }

                r.thumbnailUrl = 'r/' + opts.Key;
                cb2(null);
              });

            });
          });
      });

      
    }, cb);

  }, function(err){

    return callback(err, pkg, rev);

  });
  
};
