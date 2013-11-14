var express = require('express')
  , fs = require('fs')
  , path = require('path')
  , http = require('http')
  , util = require('util')
  , bcrypt = require('bcrypt')
  , publish = require('./routes/publish')
  , mongodb = require('mongodb')
  , ObjectID = require('mongodb').ObjectID;

function authenticate(collection, username, password, callback){
  collection.findOne({username: username}, function(err, doc){
    if (err) callback(err, false);

    if(doc) {
      bcrypt.compare(password, doc.hash, function(err, is_identical) {
        if (err) callback(err, false);
        callback(null, (is_identical) ? username : false );
      });
    } else {
      callback(null, false);
    }
  });
};


var app = express();

// Configuration
app.configure(function(){
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.cookieSession({secret: 'secret'}));

  //app.use(express.basicAuth(function(username, password, callback){
  //  authenticate(app.get('users'), username, password, callback);
  //}));

  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});


// Routes

/**
 * Commit
 **/
app.post('/publish/dpkg', publish.dpkg);
app.post('/publish/stream', publish.stream);


var server = http.createServer(app);
var MongoClient = mongodb.MongoClient;

MongoClient.connect("mongodb://localhost:27017/stan", function(err, db) {

  if (err) throw err;
  console.log("Connected to mongodb");

  //store ref to db and the collections so that it is easily accessible (app is accessible in req and res!)
  app.set('db', db);
  app.set('users', new mongodb.Collection(db, 'users'));
  app.set('dpkg', new mongodb.Collection(db, 'dpkg'));
  app.set('data', new mongodb.Collection(db, 'data'));
  app.set('changes', new mongodb.Collection(db, 'changes'));

  //TODO ensureIndex
  server.listen(3000, function(){
    console.log("Express server listening on port %d in %s mode", server.address().port, app.settings.env);
  });
  
});
