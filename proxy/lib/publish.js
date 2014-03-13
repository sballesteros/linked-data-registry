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
  , clone = require('clone')
  , ldstars = require('ldstars');


/**
 * publish
 */

module.exports = function(req, res, next){
  
  var registry = req.app.get('registry')
    , _users = req.app.get('_users')
    , admin = req.app.get('admin')
    , rootCouchRegistry = req.app.get('rootCouchRegistry');

  var id = encodeURIComponent(req.params.name + '@' + req.params.version);

  if(!('content-length' in req.headers)){
    return res.json(411, {error: 'Length Required'});
  }

  if(req.headers['content-length'] > 209715200){
    return res.json(413, {error: 'Request Entity Too Large, currently accept only package < 200Mo'});
  }

  function distributionAndstore(pkgnameIfIsFirst){
    var reqCouch = request.put(rootCouchRegistry + '/'+ id, function(err, resCouch, body){

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
        async.each(figure, function(d, cb){

          if('contentPath' in d && '_attachments' in doc){          
            var basename = path.basename(d.contentPath);
            att = doc._attachments[basename];   
            if(!att) return;
            
            d.contentUrl = doc._id.replace('@', '/') + '/figure/' + d.name + '/' + basename;
            d.contentSize = att.length;
            d.encodingFormat = att.content_type;
            d.hashAlgorithm = 'md5';
            d.hashValue = (new Buffer(att.digest.split('md5-')[1], 'base64')).toString('hex');

            //get attachment and get size
            var r = request(rootCouchRegistry + '/' + doc._id + '/' + basename);
            r.on('response', function(resStream){
              if(res.statusCode >= 400){
                return cb(errorCode('could not get attachment', res.statusCode));
              }
              //we know that attachment is an image (otherwise rejected by validate_doc_update on couchdb
              gm(resStream).size({bufferStream: true}, function (err, size) {
                if (err) return cb(err);                
                d.width = size.width + 'px';
                d.height = size.height + 'px';
                d.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(d), d.name, d.version), doc.license, {string:true});
                this.resize('256', '256')
                this.stream(function (err, stdout, stderr) {
                  console.log(err, stderr);
                  if (err) return cb(err);

                  var ropts = {
                    url: rootCouchRegistry + '/' + doc._id + '/thumb-' + basename, 
                    method: 'PUT',
                    headers:{
                      'Content-Type': d.encodingFormat,
                      'If-Match': doc._rev
                    },
                    auth: admin
                  };

                  var rthumb = request(ropts, function(err, resp, body){
                    console.log(err, body, resp.statusCode)
                    if(err) return cb(err);
                    if(resp.statusCode === 201){
                      d.thumbnailUrl = doc._id.replace('@', '/') + '/figure/' + d.name + '/thumb-' + basename;
                    }  
                    cb(null);
                  });
                  stdout.pipe(rthumb);
                });
              });
            });

          } else {
            d.contentRating = ldstars.rateResource(pjsonld.linkFigure(clone(d), d.name, d.version), doc.license, {string:true});
            cb(null);
          }

        }, function(err){
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
    req.pipe(reqCouch);
  };

  registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0'], reduce: true}, function(err, body, headers){      

    if(err) return next(err);
    if(!body.rows.length){ //first version ever: add username to maintainers of the pkg
      _users.atomic('maintainers', 'add', 'org.couchdb.user:' + req.user.name, {username: req.user.name, pkgname: req.params.name}, function(err, body, headers){

        if(err) return next(err);

        if(headers['status-code'] >= 400){
          return next(errorCode('publish aborted: could not add ' + req.user.name + ' as a maintainer', headers['status-code']));
        } else {
          distributionAndstore(req.params.name);
        };

      });
    } else {
      distributionAndstore();
    }
  });

};


function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};
