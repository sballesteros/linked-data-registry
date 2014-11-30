var http = require('http')
  , https = require('https')
  , util = require('util')
  , fs = require('fs')
  , path = require('path')
  , express = require('express')
  , SchemaOrgIo = require('schema-org-io')
  , AWS = require('aws-sdk')
  , aboutRegistry = require('./lib/about');

var ROOT = path.dirname(path.dirname(__filename));

AWS.config.loadFromPath(path.join(ROOT, process.env['CREDENTIAL_AWS']));

var credentials = {
  key: fs.readFileSync(path.join(ROOT, process.env['CREDENTIAL_KEY'])),
  cert: fs.readFileSync(path.join(ROOT, process.env['CREDENTIAL_CERT'])),
  ca: fs.readFileSync(path.join(ROOT, process.env['CREDENTIAL_CA']))
};

/* import routers */
var authRoutes = require('./routes/auth');
var userRoutes = require('./routes/users');
var maintainerRoutes = require('./routes/maintainers');
var searchRoutes = require('./routes/search');
var attachmentRoutes = require('./routes/attachments');
var docRoutes = require('./routes/doc');

/* import middlewares */
var getProxyUrl = require('./middlewares/get-proxy-url');
var serveJsonld = require('./middlewares/serve-jsonld');

/* app config */
var app = express();

app.enable('case sensitive routing');

app.set('admin', { name: process.env['COUCH_ADMIN_USER'], password: process.env['COUCH_ADMIN_PASS'] });

app.set('NODE_HOST', process.env['NODE_HOST']);
app.set('NODE_PORT_HTTP', process.env['NODE_PORT_HTTP']);
app.set('NODE_PORT_HTTPS', process.env['NODE_PORT_HTTPS']);
app.set('ROOT_COUCH', util.format('%s//%s:%s/', process.env['COUCH_PROTOCOL'], process.env['COUCH_HOST'], process.env['COUCH_PORT']));
app.set('ROOT_COUCH_ADMIN', util.format('%s//%s:%s@%s:%d/', process.env['COUCH_PROTOCOL'], process.env['COUCH_ADMIN_USER'], process.env['COUCH_ADMIN_PASS'], process.env['COUCH_HOST'], process.env['COUCH_PORT']));
app.set('ROOT_COUCH_ADMIN_USERS', app.get('ROOT_COUCH_ADMIN') + '_users/');
app.set('ROOT_COUCH_ADMIN_USERS_RW', app.get('ROOT_COUCH_ADMIN_USERS') + '_design/maintainers/_rewrite/');
app.set('ROOT_COUCH_REGISTRY', util.format('%s//%s:%s/%s/', process.env['COUCH_PROTOCOL'], process.env['COUCH_HOST'], process.env['COUCH_PORT'], process.env['COUCH_DB_NAME']));
app.set('ROOT_COUCH_ADMIN_REGISTRY', app.get('ROOT_COUCH_ADMIN') + process.env['COUCH_DB_NAME'] + '/');
app.set('ROOT_COUCH_REGISTRY_RW', app.get('ROOT_COUCH_REGISTRY') + '_design/registry/_rewrite/');
app.set('ROOT_COUCH_ADMIN_REGISTRY_RW', app.get('ROOT_COUCH_ADMIN_REGISTRY') + '_design/registry/_rewrite/');

/* global middlewares */
app.use(getProxyUrl);

/* routes */
app.use('/session', authRoutes);
app.use('/users', userRoutes);
app.use('/maintainers', maintainerRoutes);
app.use('/search', searchRoutes);
app.use('/r', attachmentRoutes);
app.use('/', docRoutes);

app.get('/', function(req, res, next) {
  res.set('Content-Type', 'application/ld+json');
  res.json(SchemaOrgIo.context());
});

app.get('/about', function(req, res, next) {
  req.cdoc = aboutRegistry;
  next();
}, serveJsonld);

/* generic error handling */
app.use(function(err, req, res, next) {
  res
    .type('application/ld+json')
    .status(err.code || 400)
    .json({
      '@context': SchemaOrgIo.contextUrl,
      '@type': 'Error',
      'description': err.message || ''
    });
});


/* servers */
var httpServer = http.createServer(app),
    httpsServer = https.createServer(credentials, app);

var S3_BUCKET = process.env['S3_BUCKET'];
var s3 = new AWS.S3({params: {Bucket: S3_BUCKET}});

s3.createBucket(function(err, data) {
  if(err) throw err;

  app.set('s3', s3);
  console.log('S3 bucket (%s) OK', S3_BUCKET);

  httpServer.listen(app.get('NODE_PORT_HTTP'));
  httpsServer.listen(app.get('NODE_PORT_HTTPS'));
  console.log('Server running at http://127.0.0.1:' + app.get('NODE_PORT_HTTP') + ' (' + app.get('NODE_HOST') + ')');
  console.log('Server running at https://127.0.0.1:' + app.get('NODE_PORT_HTTPS') + ' (' + app.get('NODE_HOST') + ')');
});
