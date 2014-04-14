var http = require('http')
  , https = require('https')
  , util = require('util')
  , semver = require('semver')
  , fs = require('fs')
  , ejs = require('ejs')
  , path = require('path')
  , express = require('express')
  , querystring = require('querystring')
  , auth = require('basic-auth')
  , cookie = require('cookie')
  , request = require('request')
  , crypto = require('crypto')
  , async = require('async')
  , mime = require('mime')
  , url = require('url')
  , jsonld = require('jsonld')
  , pjsonld = require('package-jsonld')
  , jsonldHtmlView = require('jsonld-html-view')
  , gm = require('gm')
  , clone = require('clone')
  , ldstars = require('ldstars')
  , postpublish = require('./lib/postpublish')
  , AWS = require('aws-sdk')
  , sha = require('sha')
  , deleteS3Objects = require('./lib/deleteS3Objects')
  , concat = require('concat-stream')
  , pkgJson = require('../package.json');


mime.define({
  'application/ld+json': ['jsonld'],
  'application/x-ldjson': ['ldjson', 'ldj'],
  'application/x-gzip': ['gz', 'gzip'] //tar.gz won't work
});

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});


var credentials = {
  key: fs.readFileSync(path.join($HOME, 'certificate', 'standardanalytics.key')),
  cert: fs.readFileSync(path.join($HOME, 'certificate', 'certificate-47444.crt')),
  ca: fs.readFileSync(path.join($HOME, 'certificate', 'GandiStandardSSLCA.pem'))
};

var app = express()
  , httpServer = http.createServer(app)
  , httpsServer = https.createServer(credentials, app);

var couch = {
  ssl: process.env['COUCH_SSL'],
  host: process.env['COUCH_HOST'],
  port: process.env['COUCH_PORT'],
  registry: (process.env['REGISTRY_DB_NAME'] || 'registry'),
  interaction: (process.env['INTERACTION_DB_NAME'] || 'interaction')
};

var admin = { username: process.env['COUCH_USER'], password: process.env['COUCH_PASS'] }
  , host = process.env['NODE_HOST']
  , port = process.env['NODE_PORT'] || 80
  , portHttps = process.env['NODE_PORT_HTTPS'] || 443;

var rootCouch = util.format('%s://%s:%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port) //https is optional so that we can play localy without SSL. That being said, in production it should be 1!
  , rootCouchAdmin = util.format('%s://%s:%s@%s:%d', (couch.ssl == 1) ? 'https': 'http', admin.username, admin.password, couch.host, couch.port)
  , rootCouchRegistry = util.format('%s://%s:%s/%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port, couch.registry);

var nano = require('nano')(rootCouchAdmin); //connect as admin
var registry = nano.db.use(couch.registry)
  , _users = nano.db.use('_users');


app.set('registry',  registry);
app.set('_users',  _users);
app.set('admin',  admin);
app.set('rootCouch',  rootCouch);
app.set('rootCouchAdmin',  rootCouchAdmin);
app.set('rootCouchRegistry',  rootCouchRegistry);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(app.router);
app.use(function(err, req, res, next){
  res.json(err.code || err.status_code || 400, {'error': err.message || ''});
});


function forceAuth(req, res, next){

  var user = auth(req);
  if(!user){
    return res.json(401 , {'error': 'Unauthorized'});
  }

  nano.auth(user.name, user.pass, function (err, body, headers) {
    if (err) {
      return next(err);
    }

    if (headers && headers['set-cookie']) {
      try {
        var token = cookie.parse(headers['set-cookie'][0])['AuthSession'];
      } catch(e){
        return next(new Error('no cookie for auth: ' + e.message));
      }
      req.user = { name: user.name, token: token };
      next();
    } else {
      res.json(403 , {'error': 'Forbidden'});
    }
  });

};


function logDownload(req, res, next){
  var iData = {
    '@type': 'UserDownloads',
    url: req.originalUrl,
    startDate: (new Date()).toISOString()
  };

  request.post({url:rootCouch+'/' + couch.interaction , auth:admin, json: iData}, function(err, resp, body){
    if(err) console.error(err);
    //nothing;
  });

  next();
};

var jsonParser = express.json();

/**
 * middleware to get proxy URL (store it in req.stanProxy)
 */
function getStanProxyUrl(req, res, next){

  if(req.secure){
    req.stanProxy = 'https://' + host  + ((portHttps != 443) ? (':' + portHttps) : '');
  } else {
    req.stanProxy = 'http://' + host  + ((port != 80) ? (':' + port) : '');
  }

  next();
};

function getPkgNameUrl(req, res, next){
  req.couchUrl = rootCouchRegistry + req.url.replace(req.route.regexp, '/_design/registry/_rewrite/versions/' + req.params.name);
  next();
};

function getVersionUrl(req, res, next){
  var q = req.query || {};
  q.proxy = req.stanProxy;

  var rurl;
  if (req.params.version === 'latest'){
    rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name) + '/latest');
  } else {
    rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' +  encodeURIComponent(req.params.name + '@' + req.params.version));
  }
  rurl += '?' + querystring.stringify(q);

  req.couchUrl = rootCouchRegistry + rurl;
  next();
}

function getDatasetUrl(req, res, next){
  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/dataset/' + req.params.dataset);
  rurl += (qs) ? '?' + qs : '';

  req.couchUrl = rootCouchRegistry + rurl;
  next();
};

function getCodeUrl(req, res, next){
  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/code/' + req.params.code);
  rurl += (qs) ? '?' + qs : '';

  req.couchUrl = rootCouchRegistry + rurl;
  next();
};

function getFigureUrl(req, res, next){

  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/figure/' + req.params.figure);
  rurl += (qs) ? '?' + qs : '';

  req.couchUrl = rootCouchRegistry + rurl;
  next();
};

function getArticleUrl(req, res, next){

  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/article/' + req.params.article);
  rurl += (qs) ? '?' + qs : '';

  req.couchUrl = rootCouchRegistry + rurl;
  next();
};

app.get('/auth', forceAuth, function(req, res, next){
  if(req.user){
    res.json(req.user);
  }
});

app.get('/', getStanProxyUrl, function(req, res, next){
  registry.view('registry', 'byName', {reduce:false}, function(err, body, headers) {

    if (err) return next(err);
    res.set('Link', '<https://raw.github.com/standard-analytics/linked-data-registry/master/README.md> rel="profile"');

    var home = {
      '@context': "https://w3id.org/schema.org", //TODO Schema.org team is already working on this issue and it is expected to be resolved in a couple of weeks
      '@id': req.stanProxy,
      name: 'linked-data-registry',
      version: pkgJson.version,
      keywords: pkgJson.keywords,
      description: pkgJson.description,
      author: {
        '@type': 'Organization',
        name: 'Standard Analytics IO',
        description: 'The Science API Company',
        url: 'http://standardanalytics.io',
        founder: [
          {
            '@type': 'Person',
            name: 'Sebastien Ballesteros',
            email: 'sebastien@standardanalytics.io'
          },
          {
            '@type': 'Person',
            name: 'Tiffany Bogich',
            email: 'tiff@standardanalytics.io'
          },
          {
            '@type': 'Person',
            name: 'Joseph Dureau',
            email: 'joseph@standardanalytics.io'
          }
        ]
      },
      discussionUrl: pkgJson.bugs.url,
      isBasedOnUrl: pkgJson.homepage,
      publishingPrinciples: 'http://opendatacommons.org/licenses/odbl/1.0/',
      package: body.rows.map(function(x){ return {
        '@type': 'Package',
        'name': x.key,
        'url': req.stanProxy + '/' + x.key
      };})
    };

    var ctx = {
      sch: 'http://schema.org',
      name: 'sch:name',
      version: 'sch:version',
      keywords: 'sch:keywords',
      description: 'sch:description',
      author: 'sch:author',
      founder: 'sch:founder',
      url: { '@id': 'sch:url', '@type': '@id' },
      email: 'sch:email',
      discussionUrl: { '@id': 'sch:discussionUrl', '@type': '@id' },
      isBasedOnUrl: { '@id': 'sch:isBasedOnUrl', '@type': '@id' },
      publishingPrinciples: { '@id': 'sch:publishingPrinciples', '@type': '@id' },
      package: 'http://standardanalytics.io/package/package',
      Person: { '@id': 'sch:Person', '@type': '@id' },
      Package: { '@id': 'http://standardanalytics.io/package/Package', '@type': '@id' },
      Organization: { '@id': 'sch:Organization', '@type': '@id' }
    };

    res.format({
      'text/html': function(){

        try{
          delete home['@context'];
          home["<a href='#'>@context</a>"] = "<a href='https://w3id.org/schema.org'>https://w3id.org/schema.org</a>";
          var snippet = jsonldHtmlView.urlify(home, ctx);
        } catch(e){
          return next(e);
        }

        res
          .status(res.statusCode)
          .render('explore', {snippet:snippet});
      },

      'application/json': function(){
        res.json(headers['status-code'], home);
      }
    });

  });
});


app.get('/package.jsonld', getStanProxyUrl, function(req, res, next){
  res.set('Content-Type', 'application/ld+json');

  pjsonld.context['@context']['@base'] = req.stanProxy + '/';
  res.send(JSON.stringify(pjsonld.context));
});


app.get('/search', function(req, res, next){
  var rurl = req.url.replace(req.route.path.split('?')[0], '/_design/registry/_rewrite/search');
  res.redirect(rootCouchRegistry + rurl);
});


app.put('/adduser/:name', jsonParser, function(req, res, next){
  var data = req.body;

  _users.atomic('maintainers', 'create', 'org.couchdb.user:' + data.name, data, function(err, body, headers){
    if(err) return next(err);
    res.json(headers['status-code'], body);
  });
});


app.del('/rmuser/:name', forceAuth, function(req, res, next){

  if(req.user.name !== req.params.name){
    return next(errorCode('not allowed', 403));
  }

  var id = 'org.couchdb.user:' + req.params.name;

  _users.head(id, function(err, _, headers) {
    if(err) return next(err);
    var etag = headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes

    _users.destroy(id, etag, function(err, body, headers){
      if(err) return next(err);
      res.json(headers['status-code'], body);
    });
  });

});



app.post('/owner/add', jsonParser, forceAuth, function(req, res, next){

  var data = req.body;

  if(!(('username' in data) && ('pkgname' in data))){
    return next(new Error('invalid data'));
  }

  //check if data.username is an existing user
  _users.head('org.couchdb.user:' + data.username, function(err, _, headers){
    if(err) return next(err);
    if(headers['status-code'] >= 400){
      return next(errorCode('granted user does not exists', headers['status-code']));
    }

    //check if req.user.name is a maintainter of data.pkgname
    _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user.name, function(err, maintains, headers) {
      if(err) return next(err);

      if(maintains.indexOf(data.pkgname) === -1){
        return next(errorCode('not allowed', 403));
      }
      _grant(data, res, next, headers['status-code']);
    });

  });

});


//TODO DO something if a package has no maintainers
app.post('/owner/rm', jsonParser, forceAuth, function(req, res, next){

  var data = req.body;

  if(!(('username' in data) && ('pkgname' in data))){
    return next(new Error('invalid data'));
  }

  _users.show('maintainers', 'maintains', 'org.couchdb.user:' + req.user.name, function(err, maintains) {
    if(err) return next(err);

    if(maintains.indexOf(data.pkgname) === -1){
      return next(errorCode('not allowed', 403));
    }

    _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + data.username, data, function(err, body, headers){
      if(err) return next(err);
      res.json(headers['status-code'], body);
    });

  });

});


app.get('/owner/ls/:pkgname', function(req, res, next){
  _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.pkgname}, function(err, body, headers) {
    if (err) return next(err);
    res.json(headers['status-code'], body);
  });
});

app.put('/r/:sha1', forceAuth, function(req, res, next){

  var checkStream = req.pipe(sha.stream(req.params.sha1));
  var checkErr = null;

  checkStream.on('error', function(err){
    checkErr = err;
  });

  var opts = {
    Key: req.params.sha1,
    Body: checkStream,
    ContentType: req.headers['content-type'],
    ContentLength: parseInt(req.headers['content-length'], 10),
  };

  if(req.headers['content-encoding']){
    opts['ContentEncoding'] = req.headers['content-encoding']
  }

  s3.putObject(opts, function(err, data){
    if(err) return next(err);
    if(checkErr){
      s3.deleteObject({Key: req.params.sha1}, function(err, data) {
        if (err) console.error(err);

        return next(checkErr);
      })
    } else {
      res.set('ETag', data.ETag);
      res.json(data);
    }
  });

});

app.get('/r/:sha1', logDownload, function(req, res, next){
  console.error("***** GET SHA ***********");

  s3.headObject({Key:req.params.sha1}, function(err, s3Headers) {

    if(err) return next(errorCode(err.code, err.statusCode));

    if(s3Headers.ContentLength){
      res.set('Content-Length', s3Headers.ContentLength);
    }
    if(s3Headers.ContentType){
      res.set('Content-Type', s3Headers.ContentType);
    }
    if(s3Headers.ContentEncoding){
      res.set('Content-Encoding', s3Headers.ContentEncoding);
    }
    if(s3Headers.ETag){
      res.set('ETag', s3Headers.ETag);
    }
    if(s3Headers.LastModified){
      res.set('Last-Modified', s3Headers.LastModified);
    }

    var s = s3.getObject({Key:req.params.sha1}).createReadStream();
    s.on('error', function(err){
      console.error(err);
    });
    s.pipe(res);

  });


});


/**
 * list of versions
 */
app.get('/:name', getStanProxyUrl, getPkgNameUrl, getCouchDocument, checkAuth, function(req, res, next){

  console.error("***** GET ALL VERSIONS *******")
  serveJsonld(function(x){return x;}, req, res, next);
});


/**
 * middleware to get maxSatisfying version of a Semver range
 */
function maxSatisfyingVersion(req, res, next){

  var q = req.query || {};

  if (! ('range' in q)) {
    return next();
  }

  //get all the versions of the pkg
  request(rootCouchRegistry + '/_design/registry/_rewrite/versions/' + req.params.name, function(err, res, versions){
    if(err) return next(err);

    if (res.statusCode >= 400){
      return next(errorCode('oops something went wrong when trying to validate the version', res.statusCode));
    }

    versions = JSON.parse(versions).package.map(function(x){return x.version;});
    req.params.version = semver.maxSatisfying(versions, q.range);
    if(!req.params.version){
      return next(errorCode('no version could satisfy the range ' + q.range, 404));
    }

    next();
  });

};

function checkAuth(req, res, next){
  console.error("******** CHECK AUTH *******") 

  var package;
  if (!!req.couchDocument.package) {
    package = req.couchDocument.package[0];
  } else {
    package = req.couchDocument;
  }

  if (package.private === true) {
    console.error("******** PRIVATE *******") 
    var user = auth(req);

    if (!user) {
      return res.json(401 , {'error': 'Unauthorized'});
    } else {
      nano.auth(user.name, user.pass, function (err, nanoAuthBody, headers) {
        if (err) {
          return next(err);
        }

        // check if user has access
        _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: req.params.name}, function(err, authBody, headers) {
          console.error("******** PULL MAINTAINERS *******") 
          if (err) {
            return next(err);
          }
          authBody.forEach(function (elem, i, array) {
            if (elem.name === user.name) {
              next();
            }
          })
          // return error if user is not found
          return res.json(401 , {'error': 'Unauthorized'});
        });
      }); 
    }
  } else {
    console.error("******** PUBLIC *******") 
    next();
  }

};

/**
 * get a doc from couchdb located at docUrl and serve it according to
 * the profile parameter of the Accept header
 * see http://json-ld.org/spec/latest/json-ld/#iana-considerations
 */
function getCouchDocument(req, res, next){
  console.error("****** GET COUCH DOC ********")

  request(req.couchUrl, function(err, resp, body){

    if(err) return next(err);

    if (resp.statusCode >= 400){
      errorCode(body || 'fail', resp.statusCode);
      return next(err);
    }

    try {
      body = JSON.parse(body);
    } catch(e){
      return next(e);
    }

    req.couchDocument = body

    res.status(resp.statusCode)
    next();

  });

};

function serveJsonld(linkify, req, res, next) {

    console.error("****** DEBUG SERVE JSON *********")
    console.error(req.couchDocument)
    //patch context
    var context = pjsonld.context;

    context['@context']['@base'] = req.stanProxy + '/';
    var contextUrl = context['@context']['@base'] + 'package.jsonld';

    res.format({
      'text/html': function(){
        console.error("****** TEXT HTML *********")

        var l = linkify(req.couchDocument, {addCtx:false});

        var snippet;
        try{
          l["<a href='#'>@context</a>"] = util.format("<a href='%s'>%s</a>", contextUrl, contextUrl);
          snippet = jsonldHtmlView.urlify(l, context['@context'])
        }catch(e){
          snippet = '<pre><code>' + JSON.stringify(l, null, 2) + '</code></pre>';
        }

        res.render('explore', {snippet:snippet});
      },

      'application/json': function(){
        console.error("****** JSON *********")
        var linkHeader = '<' + contextUrl + '>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"';
        res.set('Link', linkHeader);
        res.send(linkify(req.couchDocument, {addCtx:false}));
      },

      'application/ld+json': function(){
        console.error("****** JSON-LD *********")
        var accepted = req.accepted.filter(function(x){return x.value === 'application/ld+json';})[0];

        if( ( ('params' in accepted) && ('profile' in accepted.params) ) ){

          var profile = accepted.params.profile.replace(/^"(.*)"$/, '$1') //remove double quotes

          switch(profile){

            case 'http://www.w3.org/ns/json-ld#expanded':
            jsonld.expand(linkify(req.couchDocument, {addCtx: false}), {expandContext: context}, function(err, expanded){
              res.json(expanded);
            });
            break;

            case 'http://www.w3.org/ns/json-ld#flattened':
            jsonld.flatten(linkify(req.couchDocument, {addCtx: false}), context, function(err, flattened){
              res.json(flattened);
            });
            break;

            default: //#compacted and everything else
              res.json(linkify(req.couchDocument, {ctx: req.stanProxy + '/package.jsonld'}));
            break;
          }

        } else {
          console.error("****** ELSE *********")
          res.json(linkify(req.couchDocument, {ctx: req.stanProxy + '/package.jsonld'}));
        }
      }

      //TODO text/html / RDFa 1.1 lite case

    }); 
}


app.get('/:name/:version', getStanProxyUrl, maxSatisfyingVersion, getVersionUrl, getCouchDocument, checkAuth, logDownload,  function(req, res, next){

  console.error("***** GET PACKAGE VERSION *******")

  serveJsonld(pjsonld.linkPackage, req, res, next);
});


app.get('/:name/:version/dataset/:dataset', getStanProxyUrl, maxSatisfyingVersion, getDatasetUrl, getCouchDocument, checkAuth, logDownload, function(req, res, next){

  console.error("***** GET DATASET *******")

  if(couch.ssl == 1){
    req.query.secure = true;
  }

  function linkify(dataset, options){
    return pjsonld.linkDataset(dataset, req.params.name, req.params.version);
  };

  serveJsonld(linkify, req, res, next);
});


app.get('/:name/:version/code/:code', getStanProxyUrl, maxSatisfyingVersion, getCodeUrl, getCouchDocument, checkAuth, logDownload, function(req, res, next){
  console.error("***** GET CODE *******")

  if(couch.ssl == 1){
    req.query.secure = true;
  }

  function linkify(code, options){
    return pjsonld.linkCode(code, req.params.name, req.params.version);
  };

  serveJsonld(linkify, req, res, next);
});


app.get('/:name/:version/figure/:figure', getStanProxyUrl, maxSatisfyingVersion, getFigureUrl, getCouchDocument, checkAuth, logDownload, function(req, res, next){
  console.error("****** GET COUCH FIGURE ********")
  console.error(req)

  if(couch.ssl == 1){
    req.query.secure = true;
  }

  function linkify(figure, options){
    return pjsonld.linkFigure(figure, req.params.name, req.params.version);
  };

  console.error(pjsonld.linkFigure)

  serveJsonld(linkify, req, res, next);
});


app.get('/:name/:version/article/:article', getStanProxyUrl, maxSatisfyingVersion, getArticleUrl, getCouchDocument, checkAuth, logDownload, function(req, res, next){

  console.error("***** GET ARTICLE *******")

  if(couch.ssl == 1){
    req.query.secure = true;
  }

  function linkify(article, options){
    return pjsonld.linkArticle(article, req.params.name, req.params.version);
  };

  serveJsonld(linkify, req, res, next);
});


/**
 * get readme or thumbnails: do not log
 */
app.get('/:name/:version/:type/:content', maxSatisfyingVersion, function(req, res, next){

  if(['about', 'thumbnail'].indexOf(req.params.type) === -1){
    return next(errorCode('not found', 404));
  }

  if(couch.ssl == 1){
    req.query.secure = true;
  }

  var qs = querystring.stringify(req.query);
  var rurl = req.url.replace(req.route.regexp, '/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/' + req.params.content);
  rurl += (qs) ? '?' + qs : '';

  res.redirect(rootCouchRegistry + rurl);
});


/**
 * rname is the name of the resource, content can be _content (to get default content)
 */
//app.get('/:name/:version/:type/:rname/:content', maxSatisfyingVersion, logDownload, function(req, res, next){
//
//  if(['dataset', 'code', 'figure', 'article'].indexOf(req.params.type) === -1){
//    return next(errorCode('not found', 404));
//  }
//
//  if(couch.ssl == 1){
//    req.query.secure = true;
//  }
//
//  var qs = querystring.stringify(req.query);
//  var rurl = req.url.replace(req.route.regexp, '/_design/registry/_rewrite/' + encodeURIComponent(req.params.name + '@' + req.params.version) + '/' + req.params.type + '/' + req.params.rname + '/' + req.params.content);
//  rurl += (qs) ? '?' + qs : '';
//  res.redirect(rootCouchRegistry + rurl);
//});


app.put('/:name/:version', forceAuth, getStanProxyUrl, function(req, res, next){

  var id = encodeURIComponent(req.params.name + '@' + req.params.version);

  if(!('content-length' in req.headers)){
    return res.json(411, {error: 'Length Required'});
  }

  if(parseInt(req.headers['content-length'],10) > 16777216){
    return res.json(413, {error: 'Request Entity Too Large, currently accept only package < 16Mo'});
  }

  registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0'], reduce: true}, function(err, body, headers){

    if(err) return next(err);

    var reqCouch;

    if(!body.rows.length){ //first version ever: add username to maintainers of the pkg
      _users.atomic('maintainers', 'add', 'org.couchdb.user:' + req.user.name, {username: req.user.name, pkgname: req.params.name}, function(err, body, headers){

        if(err) return next(err);

        if(headers['status-code'] >= 400){
          return next(errorCode('publish aborted: could not add ' + req.user.name + ' as a maintainer', headers['status-code']));
        } else {
          reqCouch = request.put({ url: rootCouchRegistry + '/' + id, headers: { 'X-CouchDB-WWW-Authenticate': 'Cookie', 'Cookie': cookie.serialize('AuthSession', req.user.token) } }, function(err, resCouch, body){

            if(err) return next(err);
            body = JSON.parse(body);
            if(resCouch.statusCode >= 400){
              _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + req.user.name, {username: req.user.name, pkgname: req.params.name});
              return next(errorCode('publish aborted ' + body.reason, resCouch.statusCode));
            }

            postpublish(req, body, function(err, pkg, rev){
              registry.atomic('registry', 'postpublish', pkg._id, pkg, function(err, bodyPost, headersPost){
                if(err){
                  console.error(err, bodyPost);
                }
                return res.json((resCouch.statusCode === 200) ? 201: resCouch.statusCode, body);
              });

            });

          });
          req.pipe(reqCouch);
        };

      });

    } else { //version update

      reqCouch = request.put({url: rootCouchRegistry + '/'+ id, headers: { 'X-CouchDB-WWW-Authenticate': 'Cookie', 'Cookie': cookie.serialize('AuthSession', req.user.token) }}, function(err, resCouch, body){
        if(err) return next(err);

        body = JSON.parse(body);
        if(resCouch.statusCode >= 400){
          return next(errorCode('publish aborted ' + body.reason, resCouch.statusCode));
        }
        postpublish(req, body, function(err, pkg, rev){

          registry.atomic('registry', 'postpublish', pkg._id, pkg, function(err, bodyPost, headersPost){
            if(err){
              console.error(err, bodyPost);
            }
            return res.json((resCouch.statusCode === 200) ? 201: resCouch.statusCode, body);
          });

        });
      });
      req.pipe(reqCouch);
    }

  });

});


app.del('/:name/:version?', forceAuth, function(req, res, next){

  async.waterfall([

    function(cb){ //get (all) the versions
      if (req.params.version) return cb(null, [req.params.name + '@' +req.params.version]);
      registry.view('registry', 'byNameAndVersion', {startkey: [req.params.name], endkey: [req.params.name, '\ufff0'], reduce: false}, function(err, body){
        if(err) return cb(err);
        var ids = body.rows.map(function(x){return x.id;});
        if(!ids.length){
          return cb(errorCode('not found', 404));
        }
        cb(null, ids);
      });
    },

    function(ids, cb){ //delete (all) the versions

      async.each(ids, function(id, cb2){

        request(rootCouchRegistry + '/_design/registry/_rewrite/' + id, function(errPkg, respPkg, pkg){

          registry.head(id, function(err, _, headers) {
            if(err) return cb2(err);
            var etag = headers.etag.replace(/^"(.*)"$/, '$1') //remove double quotes

            //Do NOT do that as admin: otherwise doc are ALWAYS deleted so DO NOT USE registry.destroy(id, etag, cb2);
            request.del({
              url: rootCouchRegistry + '/' + id + '?rev=' +etag,
              headers: {
                'X-CouchDB-WWW-Authenticate': 'Cookie',
                'Cookie': cookie.serialize('AuthSession', req.user.token)
              }
            }, function(err, resp, body){
              if(err) return cb2(err);
              body = JSON.parse(body);
              if(resp.statusCode === 403){
                return cb2(errorCode(body.reason, resp.statusCode));
              }

              if(!errPkg){
                deleteS3Objects(req, JSON.parse(pkg), function(err){
                  if(err) console.error(err);
                  cb2(null, body);
                });
              } else {
                cb2(null, body);
              }

            });
          });

        });

      }, function(err, _){
        if(err) return cb(err);
        cb(null, req.params.name);
      });

    },

  ], function(err, name){ //remove maintainers if all version of the package have been deleted
    if(err) return next(err);

    registry.view('registry', 'byNameAndVersion', {startkey: [name], endkey: [name, '\ufff0']}, function(err, body){
      if(err) return next(err);
      if(!body.rows.length){ //no more version of name: remove all the maintainers

        _users.view_with_list('maintainers', 'maintainers', 'maintainers', {reduce: false, key: name}, function(err, maintainers) {
          if (err) return next(err);

          async.each(maintainers, function(maintainer, cb){
            _users.atomic('maintainers', 'rm', 'org.couchdb.user:' + maintainer.name, {username: maintainer.name, pkgname: name}, cb);
          }, function(err){
            if(err) return next(err);
            res.json({ok:true});
          });

        });

      } else {
        res.json({ok:true});
      }
    });

  });

});

function _grant(data, res, next, codeForced){
  _users.atomic('maintainers', 'add', 'org.couchdb.user:' + data.username, data, function(err, body, headers){
    if(err) return next(err);
    res.json(codeForced || headers['status-code'], body);
  });
};

function errorCode(msg, code){
  var err = new Error(msg);
  err.code = code;
  return err;
};



s3.createBucket(function() {
  app.set('s3', s3);
  console.log('S3 bucket (%s) OK', bucket);

  httpServer.listen(port);
  httpsServer.listen(portHttps);
  console.log('Server running at http://127.0.0.1:' + port + ' (' + host + ')');
  console.log('Server running at https://127.0.0.1:' + portHttps + ' (' + host + ')');
});

