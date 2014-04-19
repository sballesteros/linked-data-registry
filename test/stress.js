var util = require('util')
  , fs = require('fs')
  , path = require('path')
  , assert = require('assert')
  , nano = require('nano')
  , async = require('async')
  , clone = require('clone')
  , request = require('request');

request = request.defaults({headers: {'Accept': 'application/json'}});

var nano = require('nano')('http://seb:seb@127.0.0.1:5984'); //connect as admin
var registry = nano.db.use('registry')
  , _users = nano.db.use('_users');

function rurl(path){
  return 'http://127.0.0.1:3000' + path
};

function rm(db, id, cb){
  db['head'](id, function(err, _, headers){
    var etag = (headers && headers.etag.replace(/^"(.*)"$/, '$1')) || '';
    db['destroy'](id, etag, function(err, _, _){
      cb();
    });
  });
};

var pass = 'seb';
var userData = {
  name: 'user_stressed',
  salt: '209c14190cf00f0fed293a666c46aa617957dfff23d30afd2615cc28d3e4',
  password_sha: 'd6614e05191ba50ef610107f92358202eda3e440',
  email: 'user@domain.io'
};

var pkg = {
  name: 'stressed-pkg',
  version: '0.0.0',
  dataset: [
    {
      name: 'test',
      distribution: {
        contentUrl: 'http://test.com'
      }
    }
  ]
};

describe('linked data registry', function(){
  this.timeout(100000);

  before(function(done){
    request.put({url: rurl('/adduser/user_stressed'), json: userData}, function(err, resp, body){
      if(err) console.error(err);
      request.put( { url: rurl('/stressed-pkg/0.0.0'), auth: {user:'user_stressed', pass: pass}, json: pkg }, function(err, resp, body){
        if(err) console.error(err);
        done();
      });
    });
  });

  it('should put a lot of docs', function(done){
    var n = 100;
    var pkgs =[];
    for(var i=0; i<n; i++){
      var mypkg = clone(pkg);
      mypkg.version = '0.1.' + i;
      pkgs.push(mypkg);
    }

    async.eachSeries(pkgs, function(mypkg, cb){

      request.put( { url: rurl('/stressed-pkg/' + mypkg.version), auth: {user:'user_stressed', pass: pass}, json: mypkg }, function(err, resp, body){
        console.log('PUT ' + body.id + ' ' + resp.statusCode);
        if(err) console.error(err);
        cb();
      });

    }, function(err){
      if(err) throw err;
      request.get( { url: rurl('/stressed-pkg')}, function(err, resp, body){
        assert.deepEqual(JSON.parse(body).package.map(function(x){return x.version;}), [pkg.version].concat(pkgs.map(function(x){return x.version;})));
        done();
      })
    });
  });

  after(function(done){
    request.del( { url: rurl('/stressed-pkg'), auth: {user:'user_stressed', pass: pass} }, function(err, resp, body){
      rm(_users, 'org.couchdb.user:user_stressed', function(){
        done();
      });
    });
  });

});
