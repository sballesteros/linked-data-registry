var util = require('util')
  , http = require('http')
  , fs = require('fs')
  , path = require('path')
  , assert = require('assert')
  , nano = require('nano')
  , clone = require('clone')
  , request = require('request')
  , Readable = require('stream').Readable
  , querystring = require('querystring')
  , dpkgJsonLd = require('datapackage-jsonld')
  , cms = require('couch-multipart-stream')
  , path = require('path');


var root = path.dirname(__filename);

request = request.defaults({headers: {'Accept': 'application/json'}});

var nano = require('nano')('http://seb:seb@127.0.0.1:5984'); //connect as admin
var registry = nano.db.use('registry')
  , _users = nano.db.use('_users');

function rurl(path){
  return 'http://127.0.0.1:3000' + path
};

var linkHeader = '<http://localhost:3000/datapackage.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"';

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
  dataset: [
    {
      name: 'inline',
      '@context': { 
        xsd: "http://www.w3.org/2001/XMLSchema#",
        a: { '@id': '_:a', '@type': 'xsd:string' }, 
        b: { '@id': '_:b', '@type': 'xsd:integer' }
      },
      distribution: {        
        contentData: [{'a': 'a', 'b': 1}, {'a': 'x', 'b': 2} ]
      }
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
  this.timeout(10000);

  describe('auth: no side effect search and versions', function(){

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

    it('should search', function(done){
      request(rurl('/search?keys=["test"]'), function(err, resp, body){
        var expected = [
          {"id":"test-dpkg@0.0.0","key":"test","value": {"_id":"test-dpkg@0.0.0","name":"test-dpkg","description":""}},
          {"id":"test-dpkg@0.0.1","key":"test","value": {"_id":"test-dpkg@0.0.1","name":"test-dpkg","description":""}}
        ].map(function(x){ return JSON.stringify(x); }).join('\n') + '\n';

        assert.equal(body, expected);
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
        assert.equal(linkHeader, resp.headers.link);
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


  describe('dataset and attachments', function(){

    var x1 = [["a","b"],[1,2],[3,4]].join('\n'); //CSV data
    
    var expected = { 
      '@id': 'test-dpkg/0.0.0',
      '@type': 'DataCatalog',
      name: 'test-dpkg',
      version: '0.0.0',
      dataset: [
        {
          '@id': 'test-dpkg/0.0.0/dataset/inline',
          '@type': 'Dataset',
          name: 'inline',
          '@context': {
            xsd: 'http://www.w3.org/2001/XMLSchema#',
            a: { '@id': '_:a', '@type': 'xsd:string' },
            b: { '@id': '_:b', '@type': 'xsd:integer' } 
          },
          distribution: {
            '@type': 'DataDownload',
            contentUrl: 'test-dpkg/0.0.0/dataset/inline/inline.json',
            contentSize: 33,
            encodingFormat: 'application/json',
            hashAlgorithm: 'md5',
            hashValue: '9c25c6c3f5a37454d9c5d6a772212821',
            //uploadDate: '2014-01-12T01:16:24.939Z'
          },
          catalog: { name: 'test-dpkg', version: '0.0.0', url: 'test-dpkg/0.0.0' } 
        },
        {
          '@id': 'test-dpkg/0.0.0/dataset/x1',
          '@type': 'Dataset',
          name: 'x1',
          distribution: {
            '@type': 'DataDownload',
            contentPath: 'x1.csv',
            contentUrl: 'test-dpkg/0.0.0/dataset/x1/x1.csv',
            contentSize: 11,
            encodingFormat: 'text/csv',
            hashAlgorithm: 'md5',
            hashValue: 'cdf8263c082af5d04f3505bb24a400ec',
            encoding: { contentSize: 31, encodingFormat: 'application/x-gzip' },
            //uploadDate: '2014-01-12T01:16:24.939Z'
          },
          catalog: { name: 'test-dpkg', version: '0.0.0', url: 'test-dpkg/0.0.0' }
        }
      ],
      //datePublished: '2014-01-12T01:16:24.939Z',
      catalog: { name: 'test-dpkg', url: 'test-dpkg' } 
    };

    expected = dpkgJsonLd.linkDpkg(expected, {addCtx:false});

    before(function(done){     
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){

        var mydpkg = clone(dpkg);

        var s1 = new Readable();
        s1.push(x1);
        s1.push(null);

        mydpkg.dataset.push({name: 'x1', distribution: {contentPath: 'x1.csv'}});
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

    it('should have appended dataset.distribution, add datePublished, deleted dataset.distribution.contentData and serve the dpkg as JSON interpreted as JSON-LD', function(done){      
      request.get(rurl('/test-dpkg/0.0.0'), function(err, resp, body){
        body = JSON.parse(body);
        assert('datePublished' in body);
        delete body.datePublished;
        body.dataset.forEach(function(d){
          if('distribution' in d){
            assert('uploadDate' in d.distribution);
            delete d.distribution.uploadDate;
          }
        });
        assert.equal(linkHeader, resp.headers.link);
        assert.deepEqual(body, expected);   
        done();
      });
    });

    it('should have kept dataset.distribution.contentData when queried with ?contentData=true', function(done){      
      request.get(rurl('/test-dpkg/0.0.0?contentData=true'), function(err, resp, body){
        body = JSON.parse(body);
        assert.deepEqual(body.dataset[0].distribution.contentData, dpkg.dataset[0].distribution.contentData);   
        done();
      });
    });

    it('should get the datapackage as compacted JSON-LD', function(done){      
      request.get({url: rurl('/test-dpkg/0.0.0'), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"'}}, function(err, resp, body){
        body = JSON.parse(body);
        assert('@context' in body);
        done();
      });
    });

    it('should get the datapackage as expanded JSON-LD', function(done){      
      request.get({url: rurl('/test-dpkg/0.0.0'), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"'}}, function(err, resp, body){
        body = JSON.parse(body);
        assert(Array.isArray(body));
        done();
      });
    });

    it('should get the datapackage as flattened JSON-LD', function(done){      
      request.get({url: rurl('/test-dpkg/0.0.0'), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"'}}, function(err, resp, body){
        body = JSON.parse(body);
        assert('@graph' in body);
        done();
      });
    });

    it('should get a JSON dataset interpreted as JSON-LD', function(done){           
      request.get(rurl('/' + expected.dataset[1]['@id']), function(err, resp, body){
        assert.equal(linkHeader, resp.headers.link);
        body = JSON.parse(body);
        delete body.distribution.uploadDate;        
        assert.deepEqual(body, expected.dataset[1]);
        done();
      });
    });

    it('should get an attachment coming from a file', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/dataset/x1/x1.csv'), function(err, resp, body){
        assert.equal(body, x1);
        done();
      });
    });

    it('should error on invalid attachment location', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/dataset/x1/x1xxxxx.csv'), function(err, resp, body){
        assert(resp.statusCode, 404);
        done();
      });
    });

    it('should get a pseudo attachment coming from a inline data', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/dataset/inline/inline.json'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body), dpkg.dataset[0].distribution.contentData);
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

  describe('code', function(){

    before(function(done){     
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){
        var mydpkg = {
          name: 'test-dpkg',
          version: '0.0.0',
          code: [ { name: 'comp', targetProduct: { filePath: 'script.r' } } ]
        };

        fs.stat(path.join(root, 'fixture', 'script.r'), function(err, stat){
          var s = fs.createReadStream(path.join(root, 'fixture', 'script.r'));
          mydpkg._attachments = { 'script.r': { follows: true, length: stat.size, 'content_type': 'text/plain', _stream: s } };

          var uploadStream = cms(mydpkg);

          var options = { 
            port: 3000,
            hostname: '127.0.0.1',
            method: 'PUT',
            path: '/' + mydpkg.name + '/' + mydpkg.version,
            auth: 'user_a:' + pass,
            headers: uploadStream.headers
          };

          var req = http.request(options, function(res){
            res.resume();
            res.on('end', function(){        
              done();
            });
          });
          uploadStream.pipe(req);
        });

      });
    });

    it('should get a code entry with populated metadata (fileSize, hash...)', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/code/comp'), function(err, resp, body){

        var expected = { 
          '@id': 'test-dpkg/0.0.0/code/comp',
          '@type': 'Code',
          name: 'comp',
          targetProduct: 
          {
            filePath: 'script.r',
            downloadUrl: 'test-dpkg/0.0.0/code/comp/script.r',
            fileSize: 21,
            fileFormat: 'text/plain',
            hashAlgorithm: 'md5',
            hashValue: '59e68bf53d595dd5d0dda32e54c528a6',
            encoding: { contentSize: 41, encodingFormat: 'application/x-gzip' },
            '@type': 'SoftwareApplication' 
          },
          catalog: { name: 'test-dpkg', version: '0.0.0', url: 'test-dpkg/0.0.0' } 
        };

        assert.deepEqual(JSON.parse(body), expected);
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


  describe('figure', function(){

    before(function(done){     
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){
        var mydpkg = {
          name: 'test-dpkg',
          version: '0.0.0',
          figure: [ { name: 'fig', contentPath: 'daftpunk.jpg' } ]
        };

        fs.stat(path.join(root, 'fixture', 'daftpunk.jpg'), function(err, stat){
          var s = fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg'));
          mydpkg._attachments = { 'daftpunk.jpg': { follows: true, length: stat.size, 'content_type': 'image/jpeg', _stream: s } };

          var uploadStream = cms(mydpkg);

          var options = { 
            port: 3000,
            hostname: '127.0.0.1',
            method: 'PUT',
            path: '/' + mydpkg.name + '/' + mydpkg.version,
            auth: 'user_a:' + pass,
            headers: uploadStream.headers
          };

          var req = http.request(options, function(res){
            res.resume();
            res.on('end', function(){        
              done();
            });
          });
          uploadStream.pipe(req);
        });

      });
    });

    it('should get a code entry with populated metadata (fileSize, hash...)', function(done){      
      request.get(rurl('/test-dpkg/0.0.0/figure/fig'), function(err, resp, body){

        var expected = { name: 'fig',
          contentPath: 'daftpunk.jpg',
          contentUrl: 'test-dpkg/0.0.0/figure/fig/daftpunk.jpg',
          contentSize: 368923,
          encodingFormat: 'image/jpeg',
          hashAlgorithm: 'md5',
          hashValue: '4caa440d02a15e1a371b9c794565bade',
          width: '776px',
          height: '524px',
          //uploadDate: '2014-02-23T06:11:56.642Z',
          '@id': 'test-dpkg/0.0.0/figure/fig',
          '@type': 'ImageObject',
          catalog: { name: 'test-dpkg', version: '0.0.0', url: 'test-dpkg/0.0.0' } 
        };

        var result = JSON.parse(body);
        delete result.uploadDate;

        assert.deepEqual(result, expected);
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
