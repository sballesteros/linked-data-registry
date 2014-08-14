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
  , async = require('async')
  , crypto = require('crypto');

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});

request = request.defaults({headers: {'Accept': 'application/json'}, json:true});

function rurl(path){
  return 'http://localhost:3000/' + path
};

function curl(path){
  return 'http://seb:seb@127.0.0.1:5984/' + path
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
      request.put({url: rurl('adduser/user_a'), json: userData}, function(err, resp, body){
        assert.equal(resp.statusCode, 201);
        request.get(curl('_users/org.couchdb.user:user_a'), function(err, resp, body){
          assert.equal(body.name, userData.name);
          request.del({url: rurl('rmuser/user_a'), auth: {user: 'user_a', pass: pass}}, function(err, resp, body){
            assert.equal(resp.statusCode, 200);
            done();
          });
        });
      });
    });
  });

  describe('basic PUT and DELETE operations for documents', function(){
    function _test(doc, auth, _id, done){
      request.put({ url: rurl(doc['@id']), auth: auth, json: doc }, function(err, resp, body){
        assert.equal(resp.statusCode, 201);
        request.get(curl('registry/' + _id), function(err, resp, body){
          assert.equal(encodeURIComponent(body._id), _id);
          request.del({ url: rurl(doc['@id']), auth: auth }, function(err, resp, body){
            assert.equal(resp.statusCode, 200);
            done();
          });
        });
      });
    };

    before(function(done){
      request.put({url: rurl('adduser/user_a'), json: userData}, done);
    });

    it('should create and remove unversioned documents', function(done){
      var doc = { '@context': rurl('context.jsonld'), '@id': 'doc', name: 'test doc' };
      var auth = { user: 'user_a', pass: pass };
      _test(doc, auth, doc['@id'], done);
    });

    it('should create and remove versioned documents', function(done){
      var doc = { '@context': rurl('context.jsonld'), '@id': 'vdoc', name: 'test doc versioned', version: '0.0.0' };
      var auth = { user: 'user_a', pass: pass };
      _test(doc, auth, encodeURIComponent(doc['@id']+ '@' + doc.version), done);
    });

    after(function(done){
      request.del({url: rurl('rmuser/user_a'), auth: {user: 'user_a', pass: pass}}, done);
    });
  });


  describe('auth and maintainers', function(){

    var auth = {user:'user_a', pass: pass};
    var doc = { '@context': rurl('context.jsonld'), '@id': 'doc-auth', name: 'test doc auth', version: '0.0.0' };
    var userB = clone(userData); userB.name = 'user_b';
    var userC = clone(userData); userC.name = 'user_c';
    var maintainers = [
      {'_id': 'org.couchdb.user:user_a', 'name': 'user_a', 'email': 'user@domain.io'},
      {'_id': 'org.couchdb.user:user_b','name': 'user_b','email': 'user@domain.io'}
    ];

    function createFixture(done){
      request.put({url: rurl('adduser/user_a'), json: userData}, function(){
        request.put({url: rurl('adduser/user_b'), json: userB}, function(){
          request.put({url: rurl('adduser/user_c'), json: userC}, function(){
            request.put( { url: rurl(doc['@id']), auth: auth, json: doc }, function(){
              request.post( {url: rurl('maintainer/add'), auth: auth,  json: {username: 'user_b', namespace: doc['@id']}}, done);
            });
          });
        });
      });
    };

    function rmFixture(done){
      async.each([
        curl('registry/' + encodeURIComponent(doc['@id'] + '@' + doc.version)),
        curl('_users/org.couchdb.user:user_a'),
        curl('_users/org.couchdb.user:user_b'),
        curl('_users/org.couchdb.user:user_c')
      ], function(uri, cb){
        request.head(uri, function(err, resp) {
          if(!resp.headers.etag) return cb(null);
          request.del({url: uri, headers: {'If-Match': resp.headers.etag.replace(/^"(.*)"$/, '$1')}}, cb);
        });
      }, done);
    };

    describe('auth no side effects', function(){
      before(function(done){
        createFixture(done);
      });

      it('user_a and user_b should be maintainers of the doc', function(done){
        request.get(rurl('maintainer/ls/' + doc['@id']), function(err, resp, body){
          assert.deepEqual(body, maintainers);
          done();
        });
      });

      it('should not let user_a overwrite the doc', function(done){
        request.put({ url: rurl(doc['@id']), auth: {user:'user_a', pass: pass}, json: doc }, function(err, resp, body){
          assert.equal(resp.statusCode, 409);
          done();
        });
      });

      it('should not let user_c upgrade the doc', function(done){
        var mydoc = clone(doc);
        mydoc.version = '0.0.2';
        request.put({ url: rurl(mydoc['@id']), auth: {user:'user_c', pass: pass}, json: mydoc }, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      it('should not let user_c delete the doc and remove it from the roles of user_a and user_b', function(done){
        request.del( { url: rurl(doc['@id']), auth: {user:'user_c', pass: pass} }, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          request.get(rurl('maintainer/ls/' + doc['@id']), function(err, resp, body){
            assert.deepEqual(body, maintainers);
            done();
          });
        });
      });

      it('should not let user_c add itself to the maintainers of the doc', function(done){
        request.post({url: rurl('maintainer/add'), auth: {user:'user_c', pass: pass},  json: {username: 'user_c', namespace: doc['@id']}}, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      it('should not let user_c rm user_a from the maintainers of the doc', function(done){
        request.post({url: rurl('maintainer/rm'), auth: {user:'user_c', pass: pass},  json: {username: 'user_a', namespace: doc['@id']}}, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      after(function(done){
        rmFixture(done);
      });
    });

    describe('auth side effects', function(){
      beforeEach(function(done){
        createFixture(done);
      });

      it('should not let user_a remove user_b account', function(done){
        request.del({ url: rurl('rmuser/user_b'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      it('should let user_a delete the doc and remove it from the roles of user_a and user_b', function(done){
        request.del({ url: rurl(doc['@id']), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          request(rurl('maintainer/ls/' + doc['@id']), function(err, resp, body){
            assert.equal(resp.statusCode, 404);
            done();
          });
        });
      });

      it('should let user_a add user_c as a maintainers of the doc and then let user_c upgrade it (version bump)', function(done){
        request.post({url: rurl('maintainer/add'), auth: {user:'user_a', pass: pass},  json: {username: 'user_c', namespace: doc['@id']}}, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          request(rurl('maintainer/ls/' + doc['@id']), function(err, resp, body){
            var expected = clone(maintainers);
            expected.push({_id: 'org.couchdb.user:user_c', name:'user_c', email:'user@domain.io'});
            assert.deepEqual(body, expected);

            var mydoc = clone(doc); mydoc.version = '0.0.2';
            request.put({ url: rurl(mydoc['@id']), auth: {user:'user_c', pass: pass}, json: mydoc }, function(err, resp, body){
              assert.equal(resp.statusCode, 201);
              request.del({url: rurl(mydoc['@id'] + '/' + mydoc.version), auth: auth}, done); //clean up extra doc
            });
          });
        });
      });

      it('should let user_a rm user_b from the maintainers of the doc', function(done){
        request.post({url: rurl('maintainer/rm'), auth: {user:'user_a', pass: pass},  json: {username: 'user_b', namespace: doc['@id']}}, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          request.get(rurl('maintainer/ls/' + doc['@id']), function(err, resp, body){
            assert.deepEqual(body, maintainers.slice(0,-1));
            done();
          });
        });
      });

      afterEach(function(done){
        rmFixture(done);
      });
    });

  });


  describe('versions', function(){
    var auth = { user: 'user_a', pass: pass };

    var id = 'doc-version';
    var doc0 = { '@context': rurl('context.jsonld'), '@id': id, name: 'test doc version', version: '0.0.0' };
    var doc1 = { '@context': rurl('context.jsonld'), '@id': id, name: 'test doc version', version: '0.1.0' };
    var doc2 = { '@context': rurl('context.jsonld'), '@id': id, name: 'test doc version', version: '1.0.0' };

    before(function(done){
      request.put({url: rurl('adduser/user_a'), json: userData}, function(){
        async.each([doc0, doc1, doc2], function(doc, cb){
          request.put({ url: rurl(doc['@id']), auth: auth, json: doc }, cb);
        }, done);
      })
    });

    it('should retrieve a specific version', function(done){
      request.get(rurl(encodeURIComponent(doc1['@id'] + '@' + doc1.version)), function(err, resp, doc){
        assert.equal(doc.version, doc1.version);
        done();
      });
    });

    it('should retrieve the latest version', function(done){
      request.get(rurl(id), function(err, resp, doc){
        assert.equal(doc.version, doc2.version);
        done();
      });
    });

    it('should retrieve the latest version satisfying the range passed as query string parameter', function(done){
      request(rurl(id + '?' + querystring.stringify({range: '<1.0.0'})), function(err, resp, doc){
        assert.equal(doc.version, '0.1.0');
        done();
      });
    });

    it('should 404 on range that cannot be statisfied', function(done){
      request(rurl(id + '?' + querystring.stringify({range: '>2.0.0'})), function(err, resp, doc){
        assert.equal(resp.statusCode, 404);
        done();
      });
    });

    after(function(done){
      request.del({ url: rurl(doc0['@id']), auth: auth }, function(){
        request.del({url: rurl('rmuser/user_a'), auth: auth}, done);
      });
    });
  });

  //TODO test JSON-LD conversions

});
