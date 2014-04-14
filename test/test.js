var util = require('util')
  , http = require('http')
  , fs = require('fs')
  , path = require('path')
  , assert = require('assert')
  , nano = require('nano')
  , clone = require('clone')
  , request = require('request')
  , Readable = require('stream').Readable
  , crypto = require('crypto')
  , querystring = require('querystring')
  , pjsonld = require('package-jsonld')
  , cms = require('couch-multipart-stream')
  , AWS = require('aws-sdk')
  , zlib = require('zlib')
  , mime = require('mime')
  , crypto = require('crypto');

var root = path.dirname(__filename);

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});

request = request.defaults({headers: {'Accept': 'application/json'}});

var nano = require('nano')('http://seb:seb@127.0.0.1:5984'); //connect as admin
var registry = nano.db.use('registry')
  , _users = nano.db.use('_users');



function rurl(path){
  return 'http://127.0.0.1:3000' + path
};

var linkHeader = '<http://localhost:3000/package.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"';

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

var pkg = {
  name: 'test-pkg',
  version: '0.0.0',
  dataset: [
    {
      name: 'inline',
      about: [
        { name: 'a', valueType: 'xsd:string' },
        { name: 'b', valueType: 'xsd:integer' }
      ],
      distribution: {
        contentData: [{'a': 'a', 'b': 1}, {'a': 'x', 'b': 2} ]
      }
    }
  ]
};

var privatePkg = clone(pkg);
privatePkg.private = true;
privatePkg.name = 'test-private-pkg';

var maintainers = [{'name': 'user_a', 'email': 'user@domain.io'}, {'name': 'user_b','email': 'user@domain.io'}];

function createFixture(done){
  request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){
    if(err) console.error(err);
    var userB = clone(userData);
    userB.name = 'user_b';
    request.put({url: rurl('/adduser/user_b'), json: userB}, function(err, resp, body){
      if(err) console.error(err);
      var userC = clone(userData);
      userC.name = 'user_c';
      request.put({url: rurl('/adduser/user_c'), json: userC}, function(err, resp, body){
        if(err) console.error(err);
        request.put( { url: rurl('/test-pkg/0.0.0'), auth: {user:'user_a', pass: pass}, json: pkg }, function(err, resp, body){
          if(err) console.error(err);
          var mypkg = clone(pkg);
          mypkg.version = '0.0.1';
          request.put( { url: rurl('/test-pkg/0.0.1'), auth: {user:'user_a', pass: pass}, json: mypkg }, function(err, resp, body){
            if(err) console.error(err);
            request.post( {url: rurl('/owner/add'), auth: {user:'user_a', pass: pass},  json: {username: 'user_b', pkgname: 'test-pkg'}}, function(err, resp, body){
              if(err) console.error(err);
              request.put( { url: rurl('/test-private-pkg/0.0.0'), auth: {user:'user_a', pass: pass}, json: privatePkg }, function(err, resp, body){
                if(err) console.error(err);
                  request.post( {url: rurl('/owner/add'), auth: {user:'user_a', pass: pass},  json: {username: 'user_b', pkgname: 'test-private-pkg'}}, function(err, resp, body){
                    if(err) console.error(err);
                    done();
                });
              });
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
        rm(registry, 'test-pkg@0.0.0', function(){
          rm(registry, 'test-private-pkg@0.0.0', function(){
            rm(registry, 'test-pkg@0.0.1', function(){
              rm(registry, 'test-pkg@0.0.2', function(){
                var key = crypto.createHash('sha1').update(JSON.stringify(pkg.dataset[0].distribution.contentData)).digest('hex');
                s3.deleteObject({Key: key}, function(err, data){
                  done();
                });
              });
            });
          });
        });
      });
    });
  });
};

describe('linked data registry', function(){
  this.timeout(10000);


  describe('s3', function(){

    it('should upload compressible attachments', function(done){
      var headers = {
        'Content-Length': 0,
        'Content-Type': mime.lookup('trace_0.csv'),
        'Content-Encoding': 'gzip'
      };

      var digest;
      var s = fs.createReadStream(path.join(root, 'fixture', 'trace_0.csv')).pipe(zlib.createGzip());
      var sha1 = crypto.createHash('sha1');
      s.on('data', function(d) {
        headers['Content-Length'] += d.length;
        sha1.update(d);
      });
      s.on('end', function() {
        digest = sha1.digest('hex');

        var r =request.put( { url: rurl('/r/' + digest), auth: {user:'seb', pass: 'seb'}, headers: headers }, function(err, resp, body){
          if(err) throw err;
          assert('ETag' in JSON.parse(body));
          s3.deleteObject({Key: digest}, function(err, data){
            done();
          });
        });
        fs.createReadStream(path.join(root, 'fixture', 'trace_0.csv')).pipe(zlib.createGzip()).pipe(r);
      });
    });

    it('should upload non compressible attachments', function(done){
      var headers = {
        'Content-Length': 0,
        'Content-Type': mime.lookup('daftpunk.jpg')
      };

      var s = fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg'));
      var sha1 = crypto.createHash('sha1');
      s.on('data', function(d) {
        headers['Content-Length'] += d.length;
        sha1.update(d);
      });
      s.on('end', function() {
        digest = sha1.digest('hex');

        var r =request.put( { url: rurl('/r/' + digest), auth: {user:'seb', pass: 'seb'}, headers: headers }, function(err, resp, body){
          if(err) throw err;
          assert('ETag' in JSON.parse(body));
          s3.deleteObject({Key: digest}, function(err, data){
            done();
          });
        });
        fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg')).pipe(r);
      });
    });

  });


  describe('auth: no side effects', function(){

    before(function(done){
      createFixture(done);
    });

    it('should have an user', function(done){
      _users.get('org.couchdb.user:user_a', function(err, body){
        assert.equal(body.name, userData.name);
        done();
      });
    });

    it('should error with code 401 if user try to auth with wrong password', function(done){
      request.get( { url: rurl('/auth'), auth: {user:'user_a', pass: 'wrong'} }, function(err, resp, body){
        assert.equal(resp.statusCode, 401);
        done();
      });
    });

    it('should error with code 401 if user try to auth with non existent name', function(done){
      request.get( { url: rurl('/auth'), auth: {user:'user_wrong', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 401);
        done();
      });
    });

    it('should return a token and 200 on successful auth', function(done){
      request.get( { url: rurl('/auth'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 200);
        assert.equal(JSON.parse(body).name, 'user_a');
        done();
      });
    });

    it('should have a pkg', function(done){
      registry.get('test-pkg@0.0.0', function(err, body){
        if(err) console.error(err, body);
        assert.equal(body._id, 'test-pkg@0.0.0');
        done();
      });
    });

    it('user_a and user_b should be maintainers of test-pkg', function(done){
      request(rurl('/owner/ls/test-pkg'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body), maintainers);
        done();
      });
    });

    it('should not let user_a overwrite the pkg', function(done){
      request.put( { url: rurl('/test-pkg/0.0.0'), auth: {user:'user_a', pass: pass}, json: pkg }, function(err, resp, body){
        assert.equal(resp.statusCode, 409);
        done();
      });
    });

    it('should not let user_c upgrade the pkg', function(done){
      var mypkg = clone(pkg);
      mypkg.version = '0.0.2';
      request.put( { url: rurl('/test-pkg/0.0.2'), auth: {user:'user_c', pass: pass}, json: mypkg }, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        done();
      });
    });

    it('should not let user_c delete the pkg and remove test-pkg from the roles of user_a and user_b', function(done){
      request.del( { url: rurl('/test-pkg'), auth: {user:'user_c', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        request(rurl('/owner/ls/test-pkg'), function(err, resp, body){
          assert.deepEqual(JSON.parse(body), maintainers);
          done();
        });
      });
    });

    it('should not let user_c add itself to the maintainers of test-pkg', function(done){
      request.post( {url: rurl('/owner/add'), auth: {user:'user_c', pass: pass},  json: {username: 'user_c', pkgname: 'test-pkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 403);
        done();
      });
    });

    it('should not let user_c rm user_a from the maintainers of test-pkg', function(done){
      request.post( {url: rurl('/owner/rm'), auth: {user:'user_c', pass: pass},  json: {username: 'user_a', pkgname: 'test-pkg'}}, function(err, resp, body){
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

    it('should let user_a delete the pkg and remove test-pkg from the roles of user_a and user_b', function(done){
      request.del( { url: rurl('/test-pkg'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.equal(resp.statusCode, 200);

        request(rurl('/owner/ls/test-pkg'), function(err, resp, body){
          assert.equal(resp.statusCode, 404);
          done();
        });

      });
    });

    it('should let user_a add user_c as a maintainers of test-pkg and then let user_c upgrade test-pkg', function(done){
      request.post( {url: rurl('/owner/add'), auth: {user:'user_a', pass: pass},  json: {username: 'user_c', pkgname: 'test-pkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 200);
        request(rurl('/owner/ls/test-pkg'), function(err, resp, body){
          var expected = clone(maintainers);
          expected.push({name:'user_c', email:'user@domain.io'});
          assert.deepEqual(JSON.parse(body), expected);

          var mypkg = clone(pkg);
          mypkg.version = '0.0.2';
          request.put( { url: rurl('/test-pkg/0.0.2'), auth: {user:'user_c', pass: pass}, json: mypkg }, function(err, resp, body){
            assert.equal(resp.statusCode, 201);
            done();
          });

        });
      });
    });

    it('should let user_a rm user_b from the maintainers of test-pkg', function(done){
      request.post( {url: rurl('/owner/rm'), auth: {user:'user_a', pass: pass},  json: {username: 'user_b', pkgname: 'test-pkg'}}, function(err, resp, body){
        assert.equal(resp.statusCode, 200);
        request(rurl('/owner/ls/test-pkg'), function(err, resp, body){
          assert.deepEqual(JSON.parse(body), maintainers.slice(0,-1));
          done();
        });
      });
    });

    afterEach(function(done){
      rmAll(done);
    });

  });


  describe('search and versions', function(){

    before(function(done){
      createFixture(done);
    });

    it('should search public packages', function(done){
      request(rurl('/search?keys=["test"]'), function(err, resp, body){
        var expected = [
          {"id":"test-pkg@0.0.0","key":"test","value": {"_id":"test-pkg@0.0.0","name":"test-pkg","description":""}},
          {"id":"test-pkg@0.0.1","key":"test","value": {"_id":"test-pkg@0.0.1","name":"test-pkg","description":""}}
        ].map(function(x){ return JSON.stringify(x); }).join('\n') + '\n';

        assert.equal(body, expected);
        done();
      });
    });

    it('should retrieve all the versions of test-pkg', function(done){
      request(rurl('/test-pkg'), function(err, resp, body){
        assert.deepEqual(JSON.parse(body).package.map(function(x){return x.version;}), ['0.0.0', '0.0.1']);
        done();
      });
    });

    it('should retrieve versions of test-private-pkg for user_a', function(done){
      request({url: rurl('/test-private-pkg'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.deepEqual(JSON.parse(body).package.map(function(x){return x.version;}), ['0.0.0']);
        done();
      });
    });

    it('should not retrieve versions of test-private-pkg for unauthed users', function(done){
      request(rurl('/test-private-pkg'), function(err, resp, body){
        assert.equal(resp.statusCode, 401)
        done();
      });
    });

    it('should not get a dataset from a private package unauthed', function(done){
      request.get(rurl('/test-private-pkg/0.0.0/dataset/inline'), function(err, resp, body){
        assert.equal(resp.statusCode, 404)
        done();
      });
    });

    it('should get a private dataset logged in as user_a', function(done){
      request.get({url: rurl('/test-private-pkg/0.0.0/dataset/inline'), auth: {user:'user_a', pass: pass} }, function(err, resp, body){
        assert.equal(linkHeader, resp.headers.link);
        body = JSON.parse(body);
        assert.equal(body.name, 'inline');
        done();
      });
    });

    it('should retrieve the latest version of test-pkg as JSON interpreded as JSON-LD', function(done){
      request(rurl('/test-pkg/latest'), function(err, resp, body){
        assert.equal(linkHeader, resp.headers.link);
        assert.equal(JSON.parse(body).version, '0.0.1');
        done();
      });
    });

    it('should retrieve the latest version satisfying the range passed as query string parameter', function(done){
      request(rurl('/test-pkg/latest?' + querystring.stringify({range: '<0.0.1'})), function(err, resp, body){
        assert.equal(JSON.parse(body).version, '0.0.0');
        done();
      });
    });

    it('should 404 on range that cannot be statisfied', function(done){
      request(rurl('/test-pkg/latest?' + querystring.stringify({range: '>2.0.0'})), function(err, resp, body){
        assert.equal(resp.statusCode, 404);
        done();
      });
    });

    after(function(done){
      rmAll(done);
    });

  });


  describe('readme', function(){

    before(function(done){
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){

        var mypkg = {
          name: 'test-readme',
          version: '0.0.0'
        };

        fs.stat(path.join(root, 'fixture', 'README.md'), function(err, stat){

          mypkg._attachments = { 'README.md': { follows: true, length: stat.size, 'content_type': 'text/x-markdown', _stream: fs.createReadStream(path.join(root, 'fixture', 'README.md')) } };

          var s = cms(mypkg);

          var options = {
            port: 3000,
            hostname: '127.0.0.1',
            method: 'PUT',
            path: '/' + mypkg.name + '/' + mypkg.version,
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

    });

    it('should have added about', function(done){
      request.get(rurl('/test-readme/0.0.0'), function(err, resp, body){
        body = JSON.parse(body);
        assert.deepEqual(body.about, { name: 'README.md', url: 'test-readme/0.0.0/about/README.md' });
        done();
      });
    });

    it('serve the README', function(done){
      request.get(rurl('/test-readme/0.0.0/about/README.md'), function(err, resp, body){
        fs.readFile(path.join(root, 'fixture', 'README.md'), {encoding: 'utf8'}, function(err, data){
          assert.deepEqual(body, data);
          done();
        });
      });
    });

    after(function(done){
      rm(_users, 'org.couchdb.user:user_a', function(){
        rm(registry, 'test-readme@0.0.0', function(){
          done();
        });
      });
    });

  });


  describe('dataset', function(){

    before(function(done){

      fs.stat(path.join(root, 'fixture', 'trace_0.csv'), function(err, stat){

        request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){
          var headers = { 'Content-Length': 0, 'Content-Type': 'text/csv', 'Content-Encoding': 'gzip' };

          var digest;
          var s = fs.createReadStream(path.join(root, 'fixture', 'trace_0.csv')).pipe(zlib.createGzip());
          var sha1 = crypto.createHash('sha1');
          s.on('data', function(d) { headers['Content-Length'] += d.length; sha1.update(d); });
          s.on('end', function() {
            digest = sha1.digest('hex');

            var r =request.put( { url: rurl('/r/' + digest), auth: {user:'user_a', pass: pass}, headers: headers }, function(err, resp, body){
              var mypkg = {
                name: 'test-pkg',
                version: '0.0.0',
                dataset:[
                  {
                    name: 'trace',
                    distribution: {
                      contentSize: stat.size,
                      contentPath: 'trace_0.csv',
                      encodingFormat: 'text/csv',
                      contentUrl: 'r/' + digest,
                      encoding:{ encodingFormat: 'gzip', hashAlgorithm: 'sha1', hashValue: digest, contentSize: headers['Content-Length'] }
                    }
                  },
                  {
                    name: 'inline',
                    distribution: { contentData: pkg.dataset[0].distribution.contentData }
                  }
                ]
              };

              request.put({url: rurl('/test-pkg/0.0.0'), json: mypkg, auth: {user:'user_a', pass: pass}}, function(err, resp, body){
                done();
              })

            });
            fs.createReadStream(path.join(root, 'fixture', 'trace_0.csv')).pipe(zlib.createGzip()).pipe(r);
          });

        });
      });
    });


    it('should have added datePublished, deleted dataset.distribution.contentData and serve the pkg as JSON interpreted as JSON-LD', function(done){
      request.get(rurl('/test-pkg/0.0.0'), function(err, resp, body){
        body = JSON.parse(body);

        assert('datePublished' in body);
        delete body.datePublished;
        assert.equal(linkHeader, resp.headers.link);
        assert(!body.dataset[1].distribution.dataset);

        assert.equal(body.dataset[1].distribution.hashValue, crypto.createHash('sha1').update(JSON.stringify(pkg.dataset[0].distribution.contentData)).digest('hex'));
        zlib.gzip(JSON.stringify(pkg.dataset[0].distribution.contentData), function(err, data){
          var sha1 = crypto.createHash('sha1').update(data).digest('hex');
          assert.equal(body.dataset[1].distribution.encoding.hashValue, sha1);
          assert.equal(body.dataset[1].distribution.contentUrl, 'r/' + sha1);
          done();
        })
      });
    });

    it('should have kept dataset.distribution.contentData when queried with ?contentData=true', function(done){
      request.get(rurl('/test-pkg/0.0.0?contentData=true'), function(err, resp, body){
        body = JSON.parse(body);
        assert.deepEqual(body.dataset[1].distribution.contentData, pkg.dataset[0].distribution.contentData);
        done();
      });
    });

    it('should get the package as compacted JSON-LD', function(done){
      request.get({url: rurl('/test-pkg/0.0.0'), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"'}}, function(err, resp, body){
        body = JSON.parse(body);
        assert('@context' in body);
        done();
      });
    });

    it('should get the package as expanded JSON-LD', function(done){
      request.get({url: rurl('/test-pkg/0.0.0'), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"'}}, function(err, resp, body){
        body = JSON.parse(body);
        assert(Array.isArray(body));
        done();
      });
    });

    it('should get the package as flattened JSON-LD', function(done){
      request.get({url: rurl('/test-pkg/0.0.0'), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"'}}, function(err, resp, body){
        body = JSON.parse(body);
        assert('@graph' in body);
        done();
      });
    });

    it('should get a JSON dataset interpreted as JSON-LD', function(done){
      request.get(rurl('/test-pkg/0.0.0/dataset/inline'), function(err, resp, body){
        assert.equal(linkHeader, resp.headers.link);
        body = JSON.parse(body);
        assert.equal(body.name, 'inline');
        done();
      });
    });

    it('should get an attachment coming from a file', function(done){
      request.get(rurl('/test-pkg/0.0.0/dataset/trace'), function(err, resp, body){
        body = JSON.parse(body);
        request.get({url:rurl('/' + body.distribution.contentUrl), encoding:null}, function(err, resp, body){
          zlib.gunzip(body, function(err, data){
            fs.readFile(path.join(root, 'fixture', 'trace_0.csv'), function(err, odata){
              assert.equal(data.toString(), odata.toString());
              done();
            });
          });
        });
      });
    });

    it('should error on invalid attachment location', function(done){
      request.get(rurl('/r/x1xxxxx'), function(err, resp, body){
        assert(resp.statusCode, 404);
        done();
      });
    });


    it('should get a pseudo attachment coming from a inline data', function(done){
      request.get(rurl('/test-pkg/0.0.0/dataset/inline'), function(err, resp, body){
        request.get({url:rurl('/' + JSON.parse(body).distribution.contentUrl), encoding:null}, function(err, resp, body){
          zlib.gunzip(body, function(err, data){
            assert.deepEqual(JSON.parse(data.toString()), pkg.dataset[0].distribution.contentData);
            done();
          });
        });
      });
    });

    after(function(done){
      rm(_users, 'org.couchdb.user:user_a', function(){
        rm(registry, 'test-pkg@0.0.0', function(){
          s3.deleteObjects({Delete:{Objects: [{Key: '82cbfde6af09536e6c40eb9799b137abe299c0f3'}, {Key: '5b813770c87f8e6dcd9fbaa71d0d9382d027b4c7'}]}}, done);
        });
      });
    });

  });


  describe('code', function(){

    before(function(done){
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){

        fs.stat(path.join(root, 'fixture', 'script.r'), function(err, stat){

          var headers = { 'Content-Length': 0, 'Content-Type': 'text/plain' };

          var digest;
          var s = fs.createReadStream(path.join(root, 'fixture', 'script.r'));
          var sha1 = crypto.createHash('sha1');
          s.on('data', function(d) { headers['Content-Length'] += d.length; sha1.update(d); });
          s.on('end', function() {
            digest = sha1.digest('hex');

            var r =request.put( { url: rurl('/r/' + digest), auth: {user:'user_a', pass: pass}, headers: headers }, function(err, resp, body){
              var mypkg = {
                name: 'test-pkg',
                version: '0.0.0',
                code:[
                  {
                    name: 'comp',
                    targetProduct: {
                      fileSize: stat.size,
                      filePath: 'script.r',
                      fileFormat: 'text/plain',
                      downloadUrl: 'r/' + digest,
                      hashAlgorithm: 'sha1',
                      hashValue: digest
                    }
                  },
                  {
                    name: 'externalurl',
                    targetProduct: {
                      downloadUrl: 'https://raw2.github.com/standard-analytics/linked-data-registry/master/test/fixture/script.r'
                    }
                  }
                ]
              };

              request.put({url: rurl('/test-pkg/0.0.0'), json: mypkg, auth: {user:'user_a', pass: pass}}, function(err, resp, body){
                done();
              })

            });
            fs.createReadStream(path.join(root, 'fixture', 'script.r')).pipe(r);
          });

        });
      });

    });

    it('should get a code entry', function(done){
      request.get(rurl('/test-pkg/0.0.0/code/comp'), function(err, resp, body){
        assert.equal(JSON.parse(body).name, 'comp');
        done();
      });
    });

    it('should get content', function(done){
      request.get(rurl('/test-pkg/0.0.0/code/comp'), function(err, resp, body){
        body = JSON.parse(body);
        request.get(rurl('/' + body.targetProduct.downloadUrl), function(err, resp, data){
          fs.readFile(path.join(root, 'fixture', 'script.r'), {encoding:'utf8'}, function(err, odata){
            assert.equal(data, odata);
            assert.equal(body.targetProduct.hashValue, crypto.createHash('sha1').update(odata).digest('hex'));
            done();
          });
        });
      });
    });

    it('should get content from external url', function(done){
      request.get(rurl('/test-pkg/0.0.0/code/externalurl'), function(err, resp, body){
        body = JSON.parse(body);
        request.get(body.targetProduct.downloadUrl, function(err, resp, body){
          assert.equal(body, fs.readFileSync(path.join(root, 'fixture', 'script.r'), {encoding: 'utf8'}));
          done();
        });
      });
    });

    after(function(done){
      rm(_users, 'org.couchdb.user:user_a', function(){
        rm(registry, 'test-pkg@0.0.0', function(){
          s3.deleteObject({Key: '66eb98f8e52a487a604f048e545f0acadb2360d2'}, function(err, data){
            done();
          });
        });
      });
    });

  });


  describe('figure', function(){

    before(function(done){
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){

        fs.stat(path.join(root, 'fixture', 'daftpunk.jpg'), function(err, stat){

          var headers = { 'Content-Length': 0, 'Content-Type': 'image/jpeg' };

          var digest;
          var s = fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg'));
          var sha1 = crypto.createHash('sha1');
          s.on('data', function(d) { headers['Content-Length'] += d.length; sha1.update(d); });
          s.on('end', function() {
            digest = sha1.digest('hex');

            var r =request.put( { url: rurl('/r/' + digest), auth: {user:'user_a', pass: pass}, headers: headers }, function(err, resp, body){

              var mypkg = {
                name: 'test-pkg',
                version: '0.0.0',
                figure: [
                  {
                    name: 'fig',
                    contentPath: 'daftpunk.jpg',
                    contentUrl: 'r/' + digest,
                    contentSize: headers['Content-Length'],
                    encodingFormat: headers['Content-Type'],
                    hashAlgorithm: 'sha1',
                    hashValue: digest
                  }
                ]
              };

              request.put({url: rurl('/test-pkg/0.0.0'), json: mypkg, auth: {user:'user_a', pass: pass}}, function(err, resp, body){
                done();
              })

            });
            fs.createReadStream(path.join(root, 'fixture', 'daftpunk.jpg')).pipe(r);
          });

        });
      });

    });


    it('should get a figure entry with thumbnail', function(done){
      request.get(rurl('/test-pkg/0.0.0/figure/fig'), function(err, resp, body){
        body = JSON.parse(body);
        assert.equal(body.name, 'fig');
        assert.equal(body.thumbnailUrl, 'test-pkg/0.0.0/thumbnail/thumb-fig-256.jpeg');
        done();
      });
    });

    it('should get content', function(done){
      request.get(rurl('/test-pkg/0.0.0/figure/fig'), function(err, resp, body){
        body = JSON.parse(body);
        request.get(rurl('/' + body.contentUrl), function(err, resp, data){
          fs.readFile(path.join(root, 'fixture', 'daftpunk.jpg'), function(err, odata){
            assert.equal(data, odata);
            assert.equal(body.hashValue, crypto.createHash('sha1').update(odata).digest('hex'));
            done();
          });
        });
      });
    });

    after(function(done){
      rm(_users, 'org.couchdb.user:user_a', function(){
        rm(registry, 'test-pkg@0.0.0', function(){
          s3.deleteObject({Key: 'c294be54372d85d904303dfede9b06b902c3c34a'}, function(err, data){
            done();
          });
        });
      });
    });

  });


  describe('article', function(){

    before(function(done){
      request.put({url: rurl('/adduser/user_a'), json: userData}, function(err, resp, body){

        fs.stat(path.join(root, 'fixture', 'article.pdf'), function(err, stat){

          var headers = { 'Content-Length': 0, 'Content-Type': 'application/pdf' };

          var digest;
          var s = fs.createReadStream(path.join(root, 'fixture', 'article.pdf'));
          var sha1 = crypto.createHash('sha1');
          s.on('data', function(d) { headers['Content-Length'] += d.length; sha1.update(d); });
          s.on('end', function() {
            digest = sha1.digest('hex');

            var r =request.put( { url: rurl('/r/' + digest), auth: {user:'user_a', pass: pass}, headers: headers }, function(err, resp, body){
              var mypkg = {
                name: 'test-pkg',
                version: '0.0.0',
                article: [{
                  name: 'pone',
                  encoding: {
                    fileSize: stat.size,
                    filePath: 'article.pdf',
                    fileFormat: 'application/pdf',
                    contentUrl: 'r/' + digest,
                    hashAlgorithm: 'sha1',
                    hashValue: digest
                  }
                }]
              };

              request.put({url: rurl('/test-pkg/0.0.0'), json: mypkg, auth: {user:'user_a', pass: pass}}, function(err, resp, body){
                done();
              })

            });
            fs.createReadStream(path.join(root, 'fixture', 'article.pdf')).pipe(r);
          });

        });
      });

    });

    it('should get an article entry', function(done){
      request.get(rurl('/test-pkg/0.0.0/article/pone'), function(err, resp, body){
        assert.equal(JSON.parse(body).name, 'pone');
        done();
      });
    });

    it('should get content', function(done){
      request.get(rurl('/test-pkg/0.0.0/article/pone'), function(err, resp, body){
        body = JSON.parse(body);
        request.get(rurl('/' + body.encoding.contentUrl), function(err, resp, data){
          fs.readFile(path.join(root, 'fixture', 'article.pdf'), function(err, odata){
            assert.equal(data, odata);
            assert.equal(body.encoding.hashValue, crypto.createHash('sha1').update(odata).digest('hex'));
            done();
          });
        });
      });
    });

    after(function(done){
      rm(_users, 'org.couchdb.user:user_a', function(){
        rm(registry, 'test-pkg@0.0.0', function(){
          s3.deleteObject({Key: 'e573544bd953390b342246b3f2fb4094f681efcf'}, function(err, data){
            done();
          });
        });
      });
    });

  });

});
