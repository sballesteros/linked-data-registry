var util = require('util')
  , http = require('http')
  , fs = require('fs')
  , assert = require('assert')
  , nano = require('nano')
  , clone = require('clone')
  , request = require('request')
  , Readable = require('stream').Readable
  , querystring = require('querystring')
  , ldpkgJsonLd = require('datapackage-jsonld')
  , cms = require('couch-multipart-stream')
  , path = require('path');

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
  name: 'user_a',
  salt: '209c14190cf00f0fed293a666c46aa617957dfff23d30afd2615cc28d3e4',
  password_sha: 'd6614e05191ba50ef610107f92358202eda3e440',
  email: 'user@domain.io'
};

var dpkg = {
  name: 'test-dpkg',
  version: '0.0.0',
  resources: [
    {
      'name': 'inline',
      'format': 'json',
      'schema': { 'fields': [ {'name': 'a', 'type': 'string'}, {'name': 'b', 'type': 'integer'}] },
      'data': [{'a': 'a', 'b': 1}, {'a': 'x', 'b': 2} ]
    }
  ]
};

var maintainers = [{'name': 'user_a', 'email': 'user@domain.io'}, {'name': 'user_b','email': 'user@domain.io'}];

function createFixture(done){
  request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){
    var userB = clone(userData);
    userB.name = 'user_b';
    request.put({url: rurl('/adduser/user_b'), json: userB}, function(err, resp, body){
      var userC = clone(userData);
      userC.name = 'user_c';
      request.put({url: rurl('/adduser/user_c'), json: userC}, function(err, resp, body){

        request.put( { url: rurl('/test-dpkg/0.0.0'), auth: {user:'user_a', pass: pass}, json: dpkg }, function(err, resp, body){
          var mydpkg = clone(dpkg);
          mydpkg.version = '0.0.1';
          request.put( { url: rurl('/test-dpkg/0.0.1'), auth: {user:'user_a', pass: pass}, json: mydpkg }, function(err, resp, body){

            request.post( {url: rurl('/owner/add'), auth: {user:'user_a', pass: pass},  json: {username: 'user_b', dpkgName: 'test-dpkg'}}, function(err, resp, body){
              done();
            });

          });
        });
      });
    });
  });
};

function rmAll(done){
  rm(_users, 'org.couchdb.user:user_a', function(){
    rm(_users, 'org.couchdb.user:user_b', function(){
      rm(_users, 'org.couchdb.user:user_c', function(){
        rm(registry, 'test-dpkg@0.0.0', function(){
          rm(registry, 'test-dpkg@0.0.1', function(){
            rm(registry, 'test-dpkg@0.0.2', function(){
              done();
            });
          });
        });
      });
    });
  });
};

describe('data-registry', function(){

  describe('auth: no side effect and versions', function(){

    before(function(done){
      createFixture(done);
    });
    
    it('should have an user', function(done){
      _users.get('org.couchdb.user:user_a', function(err, body){
        assert.equal(body.name, userData.name);
        done();
      });
    });

    it('should have a dpkg', function(done){
      registry.get('test-dpkg@0.0.0', function(err, body){
        assert.equal(body._id, 'test-dpkg@0.0.0');      
        done();
      });
    });

    it('should retrieve all the versions of test-dpkg', function(done){
      request(rurl('/test-dpkg'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body).catalog.map(function(x){return x.version;}), ['0.0.0', '0.0.1']);
        done();
      });
    });

    it('should retrieve the latest version of test-dpkg as JSON interpreded as JSON-LD', function(done){
      request(rurl('/test-dpkg/latest'), function(err, resp, body){
        assert.equal(ldpkgJsonLd.link, resp.headers.link);
        assert.equal(JSON.parse(body).version, '0.0.1');      
        done();
      });
    });

    it('should retrieve the latest version satisfying the range passed as query string parameter', function(done){
      request(rurl('/test-dpkg/latest?' + querystring.stringify({range: '<0.0.1'})), function(err, resp, body){
        assert.equal(JSON.parse(body).version, '0.0.0');
        done();
      });
    });

    it('should 404 on range that cannot be statisfied', function(done){
      request(rurl('/test-dpkg/latest?' + querystring.stringify({range: '>2.0.0'})), function(err, resp, body){
        assert.equal(resp.statusCode, 404);
        done();
      });
    });

    it('user_a and user_b should be maintainers of test-dpkg', function(done){
      request(rurl('/owner/ls/test-dpkg'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body), maintainers);      
        done();
      });
    });

    it('should not let user_a overwrite the dpkg', function(done){
      request.put( { url: rurl('/test-dpkg/0.0.0'), auth: {user:'user_a', pass: pass}, json: dpkg }, function(err, resp, body){
        assert.equal(resp.statusCode, 409);
        done();
      });
    });

    it('should not let user_c upgrade the dpkg', function(done){
      var mydpkg = clone(dpkg);
      mydpkg.version = '0.0.2';
      request.put( { url: rurl('/test-dpkg/0.0.2'), auth: {user:'user_c', pass: pass}, json: mydpkg }, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        done();
      });
    });

    it('should not let user_c delete the dpkg and remove test-dpkg from the roles of user_a and user_b', function(done){
      request.del( { url: rurl('/test-dpkg'), auth: {user:'user_c', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        request(rurl('/owner/ls/test-dpkg'), function(err, resp, body){
          assert.deepEqual(JSON.parse(body), maintainers);       
          done();
        });
      });
    });

    it('should not let user_c add itself to the maintainers of test-dpkg', function(done){
      request.post( {url: rurl('/owner/add'), auth: {user:'user_c', pass: pass},  json: {username: 'user_c', dpkgName: 'test-dpkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        done();
      });   
    });

    it('should not let user_c rm user_a from the maintainers of test-dpkg', function(done){
      request.post( {url: rurl('/owner/rm'), auth: {user:'user_c', pass: pass},  json: {username: 'user_a', dpkgName: 'test-dpkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        done();
      });   
    });

    after(function(done){
      rmAll(done);
    });

  });


  describe('auth: side effects', function(){

    beforeEach(function(done){
      createFixture(done);
    });

    it('should let user_a remove is account', function(done){
      request.del( { url: rurl('/rmuser/user_a'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 200);
        _users.get('org.couchdb.user:user_a', function(err, body, headers){
          assert.equal(err['status-code'], 404);
          done();
        });
      });
    });

    it('should not let user_a remove user_b account', function(done){
      request.del( { url: rurl('/rmuser/user_b'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        done();
      });
    });    

    it('should let user_a delete the dpkg and remove test-dpkg from the roles of user_a and user_b', function(done){
      request.del( { url: rurl('/test-dpkg'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 200);

        request(rurl('/owner/ls/test-dpkg'), function(err, resp, body){
          assert.equal(resp.statusCode, 404);       
          done();
        });

      });
    });

    it('should let user_a add user_c as a maintainers of test-dpkg and then let user_c upgrade test-dpkg', function(done){
      request.post( {url: rurl('/owner/add'), auth: {user:'user_a', pass: pass},  json: {username: 'user_c', dpkgName: 'test-dpkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 200);
        request(rurl('/owner/ls/test-dpkg'), function(err, resp, body){
          var expected = clone(maintainers);
          expected.push({name:'user_c', email:'user@domain.io'});
          assert.deepEqual(JSON.parse(body), expected);       

          var mydpkg = clone(dpkg);
          mydpkg.version = '0.0.2';
          request.put( { url: rurl('/test-dpkg/0.0.2'), auth: {user:'user_c', pass: pass}, json: mydpkg }, function(err, resp, body){
            assert.equal(resp.statusCode, 201);
            done();
          });
          
        });
      });   
    });

    it('should let user_a rm user_b from the maintainers of test-dpkg', function(done){
      request.post( {url: rurl('/owner/rm'), auth: {user:'user_a', pass: pass},  json: {username: 'user_b', dpkgName: 'test-dpkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 200);
        request(rurl('/owner/ls/test-dpkg'), function(err, resp, body){
          assert.deepEqual(JSON.parse(body), maintainers.slice(0,-1));       
          done();
        });
      });   
    });

    afterEach(function(done){
      rmAll(done);
    });

  });


  describe('resources and attachments', function(){

    var x1 = [["a","b"],[1,2],[3,4]].join('\n');

    var expected = {
      name: 'test-dpkg',
      version: '0.0.0',
      resources: [
        {
          name: 'inline',
          format: 'json',
          schema: { fields: [ { name: 'a', type: 'string' }, { name: 'b', type: 'integer' } ] },
          data: [ { a: 'a', b: 1 }, { a: 'x', b: 2 } ],
          distribution: {
            contentUrl: '/test-dpkg/0.0.0/inline.json',
            contentSize: 33,
            encodingFormat: 'json',
            hashAlgorithm: 'md5',
            hashValue: '9c25c6c3f5a37454d9c5d6a772212821' 
          }
        },
        {
          name: 'x1',
          path: 'x1.csv',
          distribution: {
            contentUrl: '/test-dpkg/0.0.0/x1.csv',
            contentSize: 11,
            encodingFormat: 'csv',
            hashAlgorithm: 'md5',
            hashValue: 'cdf8263c082af5d04f3505bb24a400ec',
            encoding: { contentSize: 31, encodingFormat: 'gzip' } 
          }
        }
      ]
    };
    expected = ldpkgJsonLd.ify(expected, {addCtx:false});

    before(function(done){     
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){

        var mydpkg = clone(dpkg);

        var s1 = new Readable();
        s1.push(x1);
        s1.push(null);

        mydpkg.resources.push({name: 'x1', path: 'x1.csv'});
        mydpkg._attachments = { 'x1.csv': { follows: true, length: Buffer.byteLength(x1), 'content_type': 'text/csv', _stream: s1 } };

        var s = cms(mydpkg);

        var options = { 
          port: 3000,
          hostname: '127.0.0.1',
          method: 'PUT',
          path: '/' + mydpkg.name + '/' + mydpkg.version,
          auth: userData.name + ':' + pass,
          headers: s.headers
        };

        var req = http.request(options, function(res){
          res.resume();
          res.on('end', function(){        
            done();
          });
        });
        s.pipe(req);
      });
    });

    it('should have added a distribution property to resources at publication and now serve the dpkg as JSON interpreted as JSON-LD ', function(done){      
      request.get(rurl('/test-dpkg/0.0.0'), function(err, resp, body){
        body = JSON.parse(body);
        delete body.datePublished;

        assert.equal(ldpkgJsonLd.link, resp.headers.link);
        assert.deepEqual(body, expected);   
        done();
      });
    });

    it('should get a JSON resource interpreted as JSON-LD', function(done){      
      request.get(rurl('/' + expected.resources[1]['@id']), function(err, resp, body){
        assert.equal(ldpkgJsonLd.link, resp.headers.link);
        assert.deepEqual(JSON.parse(body), expected.resources[1]);
        done();
      });
    });

    it('should get an attachment coming from a file', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/x1.csv'), function(err, resp, body){
        assert.equal(body, x1);
        done();
      });
    });

    it('should error on invalid attachment location', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/x1xxxxx.csv'), function(err, resp, body){
        assert(resp.statusCode, 404);
        done();
      });
    });

    it('should get a pseudo attachment coming from a inline data', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/inline.json'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body), dpkg.resources[0].data);           
        done();
      });
    });

    after(function(done){
      rm(_users, 'org.couchdb.user:user_a', function(){
        rm(registry, 'test-dpkg@0.0.0', function(){
          done();
        });
      });      
    });
    
  });

});
