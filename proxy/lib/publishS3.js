var util = require('util')
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
  , ldstars = require('ldstars');

/**
 * modifies pkg in place
 */
module.exports = function(req, pkg, id, rev, callback){

  pkg.datePublished = (new Date()).toISOString();
  
  processDataset(req, pkg, id, rev, function(err){
    if(err) console.error(err);


  });


};

/**
 * store contentData on S3 and rate
 */
function processDataset(req, pkg, id, rev, callback){
  
  var dataset = doc.dataset || [];
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
      zlib.gzip(s, function(err, data){
        if(err) console.error(err);

        var opts = {
          Key: d.hashValue,
          Body: (err) ? s: data,
          ContentType: format,
          ContentLength: (err) ? d.contentSize: Buffer.byteLength(data)
        };

        req.app.get('s3').putObject(opts, function(err, resS3){
          if(err) {
            console.error(err);
            r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});
            return cb(null);
          }
          
          d.contentUrl =  doc._id.replace('@', '/') + '/dataset/' + r.name + '/' + r.name + '.' + format;
          r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});
          cb(null);
        });
      });
      
    } else {

      r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), pkg.license, {string:true});
      cb(null);

    }      

  }, callback);

};

/**
 * might be async one day hence the callback
 */
function processCode(req, pkg, id, rev, callback){

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
      
      d.downloadUrl = pkg._id.replace('@', '/') + '/code/' + r.name + '/' + basename;
    }
    r.contentRating = ldstars.rateResource(pjsonld.linkCode(clone(r), r.name, r.version), pkg.license, {string:true});
  });

  callback(null);

};


/**
 * might be async one day hence the callback
 */
function processArticle(req, pkg, id, rev, callback){
  var article = pkg.article || [];
  article.forEach(function(r){
    if(!r.encoding) return;

    var d = r.encoding;

    if ('contentPath' in d && '_attachments' in pkg){      
      var basename = path.basename(d.contentPath);
      d.contentUrl = pkg._id.replace('@', '/') + '/article/' + r.name + '/' + basename;
    }

    r.contentRating = ldstars.rateResource(pjsonld.linkArticle(clone(r), r.name, r.version), pkg.license, {string:true});
  });
};


/**
 * create thubnails and store them as attachments
 */
function processFigure(req, pkg, id, rev, callback){
  var figure = pkg.figure || [];

};


  /**
   * add meta information and store to db
   */
  function _markupAndStore(pkgnameIfIsFirst){

    var reqCouch = request.put({url: rootCouchRegistry + '/'+ id, json: pkg}, function(err, resCouch, body){

      if(err) return next(err);

      body = JSON.parse(body);
      if(resCouch.statusCode >= 400){
        if(pkgnameIfIsFirst){
          _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + req.user.name, {username: req.user.name, pkgname: pkgnameIfIsFirst});
        }
        return next(errorCode('publish aborted ' + body.reason, resCouch.statusCode));
      }

      registry.get(body.id, {att_encoding_info: true}, function(err, doc) {
        if(err) return next(err);
        
        //append distribution (TODO mv inside couch update function (but no crypto and no buffer inside :( ))
        var att;

        var dataset = doc.dataset || [];
        dataset.forEach(function(r){

          if(!r.distribution) return;

          var d = r.distribution;

          if('contentData' in d){

            var s = (typeof d.contentData === 'string') ? d.contentData: JSON.stringify(d.contentData);

            var format;
            if( typeof d.encodingFormat === 'string' ){
              format =  d.encodingFormat; //trust user ??? would be good to validate
            } else {
              format = (typeof d.contentData === 'string') ? 'txt':
                (s.indexOf('@context') !== -1) ? 'jsonld' : 'json';
            }
            
            d.contentUrl =  doc._id.replace('@', '/') + '/dataset/' + r.name + '/' + r.name + '.' + format;
            d.contentSize = Buffer.byteLength(s, 'utf-8');
            d.encodingFormat = mime.lookup(format);
            d.hashAlgorithm = 'md5';
            d.hashValue = crypto.createHash('md5').update(s).digest('hex');

          } else if ('contentPath' in d && '_attachments' in doc){
            
            var basename = path.basename(d.contentPath);
            att = doc._attachments[basename];   

            if(!att) return;

            d.contentUrl = doc._id.replace('@', '/') + '/dataset/' + r.name + '/' + basename;
            d.contentSize = att.length;
            d.encodingFormat = att.content_type;
            d.hashAlgorithm = 'md5';
            d.hashValue = (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex');

            if('encoding' in att){
              d.encoding = {
                contentSize: att.encoded_length,
                encodingFormat: mime.lookup(att.encoding)
              };
            }

          }
          r.contentRating = ldstars.rateResource(pjsonld.linkDataset(clone(r), r.name, r.version), doc.license, {string:true});
        });


        var code = doc.code || [];
        code.forEach(function(r){
          if(!r.targetProduct) return;
          
          var d = r.targetProduct;

          if('filePath' in d && '_attachments' in doc){
            
            var basename = path.basename(d.filePath);
            att = doc._attachments[basename];   
            
            if(!att) return;

            //if absolute path || bundlePath: delete (use for codeBundle created by ldc for instance)
            var normal = path.normalize(d.filePath);
            var absolute = path.resolve(d.filePath);
            if ( (normal === absolute) || d.bundlePath ) {
              delete d.filePath;
            };
            
            d.downloadUrl = doc._id.replace('@', '/') + '/code/' + r.name + '/' + basename;
            d.fileSize = att.length;
            d.fileFormat = d.fileFormat || att.content_type;
            d.hashAlgorithm = 'md5';
            d.hashValue = (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex');

            if('encoding' in att){
              d.encoding = {
                contentSize: att.encoded_length,
                encodingFormat: mime.lookup(att.encoding)
              };
            }
          }
          r.contentRating = ldstars.rateResource(pjsonld.linkCode(clone(r), r.name, r.version), doc.license, {string:true});
        });

        var article = doc.article || [];
        article.forEach(function(r){
          if(!r.encoding) return;

          var d = r.encoding;

          if ('contentPath' in d && '_attachments' in doc){
            
            var basename = path.basename(d.contentPath);
            att = doc._attachments[basename];   

            if(!att) return;

            d.contentUrl = doc._id.replace('@', '/') + '/article/' + r.name + '/' + basename;
            d.contentSize = att.length;
            d.encodingFormat = att.content_type;
            d.hashAlgorithm = 'md5';
            d.hashValue = (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex');

            if('encoding' in att){
              d.encoding = {
                contentSize: att.encoded_length,
                encodingFormat: mime.lookup(att.encoding)
              };
            }
          }

          r.contentRating = ldstars.rateResource(pjsonld.linkArticle(clone(r), r.name, r.version), doc.license, {string:true});
        });


        var figure = doc.figure || [];
        _markupFigure(figure, 0, doc._rev, rootCouchRegistry, admin, doc, function(err){
          if(err) console.error(err);
          //if (err) OK we just won't have sizes or thumbnails...'

          var contentRating = ldstars.rate(pjsonld.linkPackage(clone(doc)), {string:true});
          
          var postData = { contentRating: contentRating, dataset: dataset, code: code, figure: figure, article: article };

          if( ('_attachments' in doc) && ('env_.tar.gz' in doc._attachments) ){ //NOTE: README.md is added in about couchdb side in update
            att = doc._attachments['env_.tar.gz'];
            postData.encoding = {
              contentUrl: doc._id.replace('@', '/') + '/env/env_.tar.gz',
              contentSize: att.length,
              encodingFormat: att.content_type,
              hashAlgorithm: 'md5',
              hashValue:  (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex')
            }
          }

          //done as admin as only admin can add ratings
          registry.atomic('registry', 'distribution', doc._id, postData, function(err, body, headers){
            if(err) return next(err);
            res.json((headers['status-code'] === 200) ? 201: headers['status-code'], body);
          });

        });

        
      });

    });
  };

};


/**
 * recursively thumbnail figures (has to be sequential so that latest _rev is passed to couch)
 */
function _markupFigure(figures, cnt, _rev, rootCouchRegistry, admin, doc, callback){

  if(!figures.length){
    return callback(null);
  }

  var r = figures[cnt];

  if('contentPath' in r && '_attachments' in doc){          
    var basename = path.basename(r.contentPath);
    att = doc._attachments[basename];   
    if(!att) return;
    
    r.contentUrl = doc._id.replace('@', '/') + '/figure/' + r.name + '/' + basename;
    r.contentSize = att.length;
    r.encodingFormat = att.content_type;
    r.hashAlgorithm = 'md5';
    r.hashValue = (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex');

    //get attachment and get size
    var reqAtt = request(rootCouchRegistry + '/' + doc._id + '/' + basename);
    reqAtt.on('response', function(resAttStream){

      if(resAttStream.statusCode >= 400){
        return callback(errorCode('could not get attachment', resAttStream.statusCode));
      }

      //we know that attachment is an image (otherwise rejected by validate_doc_update on couchdb
      gm(resAttStream).size({bufferStream: true}, function (err, size) {
        if (err) return callback(err);                

        r.width = size.width + 'px';
        r.height = size.height + 'px';
        r.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(r), r.name, r.version), doc.license, {string:true});
        this.resize('256', '256')
        this.stream(function (err, stdout, stderr) {
          if (err) return callback(err);

          var ropts = {
            url: rootCouchRegistry + '/' + doc._id + '/thumb-' + basename, 
            method: 'PUT',
            headers:{
              'Content-Type': r.encodingFormat,
              'If-Match': _rev
            },
            auth: admin
          };

          var rthumb = request(ropts, function(err, resp, body){
            if(err) return callback(err);

            if (resp.statusCode === 201) {
              body = JSON.parse(body);

              r.thumbnailUrl = doc._id.replace('@', '/') + '/figure/' + r.name + '/thumb-' + basename;
              if (++cnt < figures.length) {
                _markupFigure(figures, cnt, body.rev, rootCouchRegistry, admin, doc, callback);
              } else {
                callback(null);
              }
            } else {
              callback(errorCode('could not PUT thumbnail', resp.statusCode))
            }

          });
          stdout.pipe(rthumb);
        });
      });
    });

  } else {
    r.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(d), r.name, r.version), doc.license, {string:true});
    if (++cnt < figures.length) {
      _markupFigure(figures, cnt, body.rev, rootCouchRegistry, admin, doc, callback);
    } else {
      callback(null);
    }
  }

};


function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};

