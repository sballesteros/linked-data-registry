var util = require('util')
  , fs = require('fs')
  , assert = require('assert')
  , nano = require('nano')
  , clone = require('clone')
  , request = require('request')
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
  ],
  date: (new Date()).toISOString()
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

  describe('no side effect', function(){

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

    it('should retrieve dpkg with url instead of resources', function(done){
      request(rurl('/test-dpkg/0.0.0'), function(err, resp, body){
        var expected = clone(dpkg);
        delete expected.resources[0].data;
        delete expected.date;
        expected.resources[0].url = 'http://localhost:3000/test-dpkg/0.0.0/inline'
        assert.deepEqual(JSON.parse(body), expected);      
        done();
      });
    });

    it('should retrieve dpkg as is', function(done){
      request(rurl('/test-dpkg/0.0.0?clone=true'), function(err, resp, body){
        var expected = clone(dpkg);
        delete expected.date;
        assert.deepEqual(JSON.parse(body), expected);      
        done();
      });
    });

    it('should retrieve a resource', function(done){
      request(rurl('/test-dpkg/0.0.0/inline'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body), dpkg.resources[0].data);      
        done();
      });
    });

    it('should retrieve the meta data of a resource only', function(done){
      request(rurl('/test-dpkg/0.0.0/inline?meta=true'), function(err, resp, body){
        var expected = clone(dpkg.resources[0]);
        delete expected.data;
        assert.deepEqual(JSON.parse(body), expected);      
        done();
      });
    });

    it('should retrieve all the versions of test-dpkg', function(done){
      request(rurl('/test-dpkg'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body), ['0.0.0', '0.0.1']);      
        done();
      });
    });

    it('should retrieve the latest version of test-dpkg', function(done){
      request(rurl('/test-dpkg/latest'), function(err, resp, body){
        assert.equal(JSON.parse(body).version, '0.0.1');      
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

    it('should not let user_c delete the dpkg and remove test-dpkg from teh roles of user_a and user_b', function(done){
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


  describe('side effects', function(){

    beforeEach(function(done){
      createFixture(done);
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


});

