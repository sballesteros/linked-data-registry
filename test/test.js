var util = require('util')
  , http = require('http')
  , fs = require('fs')
  , path = require('path')
  , assert = require('assert')
  , clone = require('clone')
  , request = require('request')
  , Readable = require('stream').Readable
  , crypto = require('crypto')
  , querystring = require('querystring')
  , Packager = require('package-jsonld')
  , cms = require('couch-multipart-stream')
  , AWS = require('aws-sdk')
  , zlib = require('zlib')
  , mime = require('mime')
  , crypto = require('crypto');

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});

request = request.defaults({headers: {'Accept': 'application/json'}, json:true});

function rurl(path){
  return 'http://localhost:3000' + path
};

function curl(path){
  return 'http://seb:seb@127.0.0.1:5984' + path
};


var pass = 'seb';
var userData = {
  name: 'user_a',
  salt: '209c14190cf00f0fed293a666c46aa617957dfff23d30afd2615cc28d3e4',
  password_sha: 'd6614e05191ba50ef610107f92358202eda3e440',
  email: 'user@domain.io'
};

describe('linked data registry', function(){
  this.timeout(40000);

  describe('basic PUT and DELETE operations for users', function(){
    it('should create and remove users', function(done){
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){
        assert.equal(resp.statusCode, 201);
        request.get(curl('/_users/org.couchdb.user:user_a'), function(err, resp, body){
          assert.equal(body.name, userData.name);
          request.del({url: rurl('/rmuser/user_a'), auth: {user: 'user_a', pass: pass}}, function(err, resp, body){
            assert.equal(resp.statusCode, 200);
            done();
          });
        });
      });
    });
  });

  describe('basic PUT and DELETE operations for documents', function(){
    function _test(doc, auth, _id, done){
      request.put({ url: rurl('/' + doc['@id']), auth: auth, json: doc }, function(err, resp, body){
        assert.equal(resp.statusCode, 201);
        request.get(curl('/registry/' + _id), function(err, resp, body){
          assert.equal(encodeURIComponent(body._id), _id);
          request.del({ url: rurl('/' + doc['@id']), auth: auth }, function(err, resp, body){
            assert.equal(resp.statusCode, 200);
            done();
          });
        });
      });
    };

    before(function(done){
      request.put({url: rurl('/adduser/user_a'), json: userData}, done);
    });

    it('should create and remove unversioned documents', function(done){
      var doc = { '@context': rurl('/context.jsonld'), '@id': 'pkg', name: 'test doc' };
      var auth = { user: 'user_a', pass: pass };
      _test(doc, auth, doc['@id'], done);
    });

    it('should create and remove versioned documents', function(done){
      var doc = { '@context': rurl('/context.jsonld'), '@id': 'vpkg', name: 'test doc versioned', version: '0.0.0' };
      var auth = { user: 'user_a', pass: pass };
      _test(doc, auth, encodeURIComponent(doc['@id']+ '@' + doc.version), done);
    });

    after(function(done){
      request.del({url: rurl('/rmuser/user_a'), auth: {user: 'user_a', pass: pass}}, done);
    });

  });

});
