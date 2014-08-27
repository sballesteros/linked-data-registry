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
  , SaSchemaOrg = require('sa-schema-org')
  , cms = require('couch-multipart-stream')
  , AWS = require('aws-sdk')
  , zlib = require('zlib')
  , mime = require('mime')
  , async = require('async')
  , crypto = require('crypto');

var root = path.dirname(__filename);

AWS.config.loadFromPath(path.join(path.dirname(root), process.env['CREDENTIAL_AWS']));

var bucket = process.env['S3_BUCKET'];
var s3 = new AWS.S3({params: {Bucket: bucket}});

request = request.defaults({headers: {'Accept': 'application/json'}, json:true});

function rurl(path){
  return util.format('http://%s:%s/%s',
                     process.env['NODE_HOST'],
                     process.env['NODE_PORT'],
                     path);
};

function curl(path){
  return util.format('%s//%s:%s@%s:%s/%s',
                     process.env['COUCH_PROTOCOL'],
                     process.env['COUCH_ADMIN_USER'],
                     process.env['COUCH_ADMIN_PASS'],
                     process.env['COUCH_HOST'],
                     process.env['COUCH_PORT'],
                     path);
};

var userData = {
  '@id': 'users/user_a',
  '@type': ['Person', 'Role'],
  email: 'mailto:user@domain.io',
  password: 'secret'
};

describe('linked data registry', function(){
  this.timeout(40000);

  describe('basic PUT and DELETE operations for users', function(){
    it('should create and remove users', function(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(err, resp, body){
        assert.equal(resp.statusCode, 201);
        request.get(rurl('users/user_a'), function(err, resp, body){
          assert.equal(body['@id'], userData['@id']);
          request.del({url: rurl('users/user_a'), auth: {user: 'user_a', pass: userData.password}}, function(err, resp, body){
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
      request.put({url: rurl('users/user_a'), json: userData}, done);
    });

    it('should create and remove unversioned documents', function(done){
      var doc = { '@context': SaSchemaOrg.contextUrl, '@id': 'doc', name: 'test doc' };
      var auth = { user: 'user_a', pass: userData.password };
      _test(doc, auth, doc['@id'], done);
    });

    it('should create and remove versioned documents', function(done){
      var doc = { '@context': SaSchemaOrg.contextUrl, '@id': 'vdoc', name: 'test doc versioned', version: '0.0.0' };
      var auth = { user: 'user_a', pass: userData.password };
      _test(doc, auth, encodeURIComponent(doc['@id']+ '@' + doc.version), done);
    });

    after(function(done){
      request.del({url: rurl('users/user_a'), auth: {user: 'user_a', pass: userData.password}}, done);
    });
  });


  describe('auth and maintainers', function(){

    var auth = {user:'user_a', pass: userData.password};
    var doc = { '@context': SaSchemaOrg.contextUrl, '@id': 'doc-auth', name: 'test doc auth', version: '0.0.0' };
    var userB = clone(userData); userB['@id'] = 'users/user_b';
    var userC = clone(userData); userC['@id'] = 'users/user_c';
    var accountablePersons =  [
      { '@id': 'users/user_a', '@type': 'Person', email: 'mailto:user@domain.io' },
      { '@id': 'users/user_b', '@type': 'Person', email: 'mailto:user@domain.io' }
    ];

    function createFixture(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(){
        request.put({url: rurl('users/user_b'), json: userB}, function(){
          request.put({url: rurl('users/user_c'), json: userC}, function(){
            request.put( { url: rurl(doc['@id']), auth: auth, json: doc }, function(){
              request.post( {url: rurl('maintainers/add/user_b/' + doc['@id']), auth: auth}, done);
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

      it('should error with code 401 if user try to auth with wrong password', function(done){
        request.get( { url: rurl('session'), auth: {user:'user_a', pass: 'wrong'} }, function(err, resp, body){
          assert.equal(resp.statusCode, 401);
          done();
        });
      });

      it('should error with code 401 if user try to auth with non existent name', function(done){
        request.get( { url: rurl('session'), auth: {user:'user_wrong', pass: userData.password} }, function(err, resp, body){
          assert.equal(resp.statusCode, 401);
          done();
        });
      });

      it('should return a token and 200 on successful auth', function(done){
        request.get( { url: rurl('session'), auth: {user:'user_a', pass: userData.password} }, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          assert.equal(body.name, 'user_a');
          done();
        });
      });

      it('user_a and user_b should be maintainers of the doc', function(done){
        request.get(rurl('maintainers/ls/' + doc['@id']), function(err, resp, body){
          assert.deepEqual(body.accountablePerson, accountablePersons);
          done();
        });
      });

      it('should not let user_a overwrite the doc', function(done){
        request.put({ url: rurl(doc['@id']), auth: {user:'user_a', pass: userData.password}, json: doc }, function(err, resp, body){
          assert.equal(resp.statusCode, 409);
          done();
        });
      });

      it('should not let user_c upgrade the doc', function(done){
        var mydoc = clone(doc);
        mydoc.version = '0.0.2';
        request.put({ url: rurl(mydoc['@id']), auth: {user:'user_c', pass: userData.password}, json: mydoc }, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      it('should not let user_c delete the doc and remove it from the roles of user_a and user_b', function(done){
        request.del( { url: rurl(doc['@id']), auth: {user:'user_c', pass: userData.password} }, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          request.get(rurl('maintainers/ls/' + doc['@id']), function(err, resp, body){
            assert.deepEqual(body.accountablePerson, accountablePersons);
            done();
          });
        });
      });

      it('should not let user_c add itself to the maintainers of the doc', function(done){
        request.post({url: rurl('maintainers/add/user_c/' + doc['@id']), auth: {user: 'user_c', pass: userData.password}}, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      it('should not let user_c rm user_a from the maintainers of the doc', function(done){
        request.post({url: rurl('maintainers/rm/user_a/' + doc['@id']), auth: {user:'user_c', pass: userData.password}}, function(err, resp, body){
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
        request.del({ url: rurl('users/user_b'), auth: {user:'user_a', pass: userData.password} }, function(err, resp, body){
          assert.equal(resp.statusCode, 403);
          done();
        });
      });

      it('should let user_a delete the doc and remove it from the roles of user_a and user_b', function(done){
        request.del({ url: rurl(doc['@id']), auth: {user:'user_a', pass: userData.password} }, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          request(rurl('maintainers/ls/' + doc['@id']), function(err, resp, body){
            assert.equal(resp.statusCode, 404);
            done();
          });
        });
      });

      it('should let user_a add user_c as a maintainers of the doc and then let user_c upgrade it (version bump)', function(done){
        request.post({url: rurl('maintainers/add/user_c/' + doc['@id']), auth: {user:'user_a', pass: userData.password}}, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          request(rurl('maintainers/ls/' + doc['@id']), function(err, resp, body){
            var expected = clone(accountablePersons);
            expected.push({'@id':'users/user_c', '@type': 'Person', email:'mailto:user@domain.io'});
            assert.deepEqual(body.accountablePerson, expected);

            var mydoc = clone(doc); mydoc.version = '0.0.2';
            request.put({ url: rurl(mydoc['@id']), auth: {user:'user_c', pass: userData.password}, json: mydoc }, function(err, resp, body){
              assert.equal(resp.statusCode, 201);
              request.del({url: rurl(mydoc['@id'] + '?version=' + mydoc.version), auth: auth}, done); //clean up extra doc
            });
          });
        });
      });

      it('should let user_a rm user_b from the maintainers of the doc', function(done){
        request.post({url: rurl('maintainers/rm/user_b/' + doc['@id']), auth: {user:'user_a', pass: userData.password}}, function(err, resp, body){
          assert.equal(resp.statusCode, 200);
          request.get(rurl('maintainers/ls/' + doc['@id']), function(err, resp, body){
            assert.deepEqual(body.accountablePerson, accountablePersons.slice(0,-1));
            done();
          });
        });
      });

      afterEach(function(done){
        rmFixture(done);
      });
    });

  });


  describe('versions for versioned docs', function(){
    var auth = { user: 'user_a', pass: userData.password };

    var id = 'doc-version';
    var doc0 = { '@context': SaSchemaOrg.contextUrl, '@id': id, name: 'test doc version', version: '0.0.0' };
    var doc1 = { '@context': SaSchemaOrg.contextUrl, '@id': id, name: 'test doc version', version: '0.1.0' };
    var doc2 = { '@context': SaSchemaOrg.contextUrl, '@id': id, name: 'test doc version', version: '1.0.0' };

    before(function(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(){
        async.eachSeries([doc0, doc1, doc2], function(doc, cb){
          request.put({ url: rurl(doc['@id']), auth: auth, json: doc }, cb);
        }, done);
      });
    });

    it('should retrieve a specific version', function(done){
      request.get(rurl(doc1['@id'] + '?' + querystring.stringify({version: doc1.version})), function(err, resp, doc){
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

    it('should have set the latest tag only to the latest version', function(done){
      async.map([doc0, doc1, doc2].map(function(d){return curl('registry/' + encodeURIComponent(id + '@' + d.version));}), function(uri, cb){
        request.get(uri, function(err, resp, body){ cb(err, body); });
      }, function(err, docs){
        assert(!('latest' in docs[0]));
        assert(!('latest' in docs[1]));
        assert(docs[2].latest);
        done();
      });
    });

    it('should retrieve the latest version satisfying the range passed as query string parameter', function(done){
      request(rurl(id + '?' + querystring.stringify({version: '<1.0.0'})), function(err, resp, doc){
        assert.equal(doc.version, '0.1.0');
        done();
      });
    });

    it('should 404 on range that cannot be statisfied', function(done){
      request(rurl(id + '?' + querystring.stringify({version: '>2.0.0'})), function(err, resp, doc){
        assert.equal(resp.statusCode, 404);
        done();
      });
    });

    after(function(done){
      request.del({ url: rurl(id), auth: auth }, function(){
        request.del({url: rurl('users/user_a'), auth: auth}, done);
      });
    });
  });

  describe('revision for unversioned docs', function(){
    var auth = { user: 'user_a', pass: userData.password };

    var id = 'doc-unversioned';
    var doc0 = { '@context': SaSchemaOrg.contextUrl, '@id': id, name: 'test revision' };
    var doc1 = { '@context': SaSchemaOrg.contextUrl, '@id': id, name: 'test revision changed' };

    before(function(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(){
        async.eachSeries([doc0, doc1], function(doc, cb){
          request.put({ url: rurl(doc['@id']), auth: auth, json: doc }, cb);
        }, done);
      })
    });

    it('should retrieve the latest revision', function(done){
      request.get(rurl(id), function(err, resp, doc){
        assert.equal(doc.name, doc1.name);
        done();
      });
    });

    it('should 404 if a version is asked', function(done){
      request(rurl(encodeURIComponent(id + '@0.1.2')), function(err, resp, doc){
        assert.equal(resp.statusCode, 404);
        done();
      });
    });

    after(function(done){
      request.del({ url: rurl(id), auth: auth }, function(){
        request.del({url: rurl('users/user_a'), auth: auth}, done);
      });
    });

  });

  describe('parts', function(){
    var auth = { user: 'user_a', pass: userData.password };
    var id = 'test-part';
    var doc = {
      '@context': SaSchemaOrg.contextUrl,
      '@id': id,
      hasPart: [
        { '@id': id + '/part', about: [{'@id': 'http://example.com/subject', name: 'subject'}] },
        { '@id': id + '/part/long/path', name: 'long path' },
        { '@id': 'github:repo', name: 'repo' },
      ]
    };

    before(function(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(){
        request.put({ url: rurl(id), auth: auth, json: doc }, done);
      })
    });

    it('should retrieve an internal part with a short path', function(done){
      request.get(rurl(doc.hasPart[0]['@id']), function(err, resp, part){
        assert.equal(part.name, doc.hasPart[0].name);
        done();
      });
    });

    it('should retrieve an internal part with a short path when part has a trailing slash', function(done){
      request.get(rurl(doc.hasPart[0]['@id'] + '/'), function(err, resp, part){
        assert.equal(part.name, doc.hasPart[0].name);
        done();
      });
    });

    it('should retrieve an internal part with a long path', function(done){
      request.get(rurl(doc.hasPart[1]['@id']), function(err, resp, part){
        assert.equal(part.name, doc.hasPart[1].name);
        done();
      });
    });

    it('should retrieve a part with an URL', function(done){
      request.get(rurl(id + '/' + encodeURIComponent(doc.hasPart[0]['about'][0]['@id'])), function(err, resp, part){
        assert.equal(part.name, doc.hasPart[0]['about'][0].name);
        done();
      });
    });

    it('should retrieve a part with an CURIE', function(done){
      request.get(rurl(id + '/' + encodeURIComponent(doc.hasPart[2]['@id'])), function(err, resp, part){
        assert.equal(part.name, doc.hasPart[2].name);
        done();
      });
    });

    after(function(done){
      request.del({ url: rurl(id), auth: auth }, function(){
        request.del({url: rurl('users/user_a'), auth: auth}, done);
      });
    });
  });

  describe('JSON-LD profiles', function(){
    var auth = { user: 'user_a', pass: userData.password };
    var id = 'test-profiles';
    var doc = { '@context': SaSchemaOrg.contextUrl, '@id': id, about: [{name: 'about profile'}] };

    before(function(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(){
        request.put({ url: rurl(id), auth: auth, json: doc }, done);
      })
    });

    it('should get the doc as compacted JSON-LD', function(done){
      request.get({url: rurl(id), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#compacted"'}}, function(err, resp, body){
        assert.deepEqual(body.about, doc.about);
        done();
      });
    });

    it('should get the doc as expanded JSON-LD', function(done){
      request.get({url: rurl(id), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#expanded"'}}, function(err, resp, body){
        assert(Array.isArray(body));
        done();
      });
    });

    it('should get the doc as flattened JSON-LD', function(done){
      request.get({url: rurl(id), headers: {'Accept': 'application/ld+json;profile="http://www.w3.org/ns/json-ld#flattened"'}}, function(err, resp, body){
        assert('@graph' in body);
        done();
      });
    });

    it('should get the doc as JSON interpreted as JSON-LD', function(done){
      request.get(rurl(id), function(err, resp, body){
        assert.equal(resp.headers.link, SaSchemaOrg.contextLink);
        assert.deepEqual(body.about, doc.about);
        done();
      });
    });

    after(function(done){
      request.del({ url: rurl(id), auth: auth }, function(){
        request.del({url: rurl('users/user_a'), auth: auth}, done);
      });
    });

  });

  describe('attachments (S3)', function(){
    var auth = { user: 'user_a', pass: userData.password };

    before(function(done){
      request.put({url: rurl('users/user_a'), json: userData}, done);
    });

    it('should PUT a compressible attachments and have it deleted when the parent document is deleted', function(done){
      var digestSha1, digestMd5;
      var contentLength = 0;
      var s = fs.createReadStream(path.join(root, 'fixture', 'data.csv')).pipe(zlib.createGzip());
      var sha1 = crypto.createHash('sha1'); var md5 = crypto.createHash('md5');
      s.on('data', function(d) { contentLength += d.length; sha1.update(d); md5.update(d); });
      s.on('end', function() {
        digestSha1 = sha1.digest('hex');
        digestMd5 = md5.digest('base64');

        var ropts = {
          url: rurl('r/' + digestSha1),
          auth: auth,
          headers: {
            'Content-Length': contentLength,
            'Content-Type': 'text/csv',
            'Content-Encoding': 'gzip',
            'Content-MD5': digestMd5
          }
        };

        var r = request.put(ropts, function(err, resp, body){
          assert('etag' in resp.headers);
          //put a document referencing the attachment
          var doc = { '@context': SaSchemaOrg.contextUrl, '@id': 's3doc', contentUrl: 'r/' + digestSha1 };
          request.put({ url: rurl(doc['@id']), auth: auth, json: doc }, function(err, resp, body){
            assert(resp.statusCode, 201);

            //get the attachment back
            request.get({url: rurl(doc.contentUrl), encoding:null, json:false}, function(err, resp, gzdata){
              assert(resp.headers['content-type'].split(';')[0] == ropts.headers['Content-Type']);
              assert(resp.headers['content-encoding'] == ropts.headers['Content-Encoding']);
              assert(resp.headers['content-length'] == ropts.headers['Content-Length']);
              assert.equal(resp.statusCode, 200);
              zlib.gunzip(gzdata, function(err, data){
                fs.readFile(path.join(root, 'fixture', 'data.csv'), function(err, odata){
                  assert.equal(data.toString(), odata.toString());

                  //delete the document -> will delete the s3 object
                  request.del({ url: rurl(doc['@id']), auth: auth }, function(err, resp, body){
                    assert(resp.statusCode, 200);

                    //check that the object have been deleted on s3
                    s3.headObject({Key: digestSha1}, function(err, s3Headers) {
                      assert.equal(err.statusCode, 404);
                      done();
                    });
                  });
                });
              });
            });
          });
        });
        fs.createReadStream(path.join(root, 'fixture', 'data.csv')).pipe(zlib.createGzip()).pipe(r);
      });
    });

    after(function(done){
      request.del({url: rurl('users/user_a'), auth: auth}, done);
    });

  });

  describe('search', function(){
    var auth = { user: 'user_a', pass: userData.password };
    var doc0 = { '@context': SaSchemaOrg.contextUrl, '@id': 'cw0', name: 'a', keywords: 'a' };
    var doc1 = { '@context': SaSchemaOrg.contextUrl, '@id': 'cw1', name: 'a, b, c', keywords: ['a', 'b', 'c'] };
    var doc2 = { '@context': SaSchemaOrg.contextUrl, '@id': 'cw2', name: 'a, b', keywords: ['a', 'b'] };

    before(function(done){
      request.put({url: rurl('users/user_a'), json: userData}, function(){
        async.eachSeries([doc0, doc1, doc2], function(doc, cb){
          request.put({ url: rurl(doc['@id']), auth: auth, json: doc }, cb);
        }, done);
      })
    });

    it('should search by keywords and get 3 results', function(done){
      request.get(rurl('search?keywords=a'), function(err, resp, body){
        assert.equal(body.itemListElement.length, 3);
        done();
      });
    });

    it('should search by keywords and get 1 results', function(done){
      request.get(rurl('search?keywords=a&keywords=c'), function(err, resp, body){
        assert.equal(body.itemListElement.length, 1);
        done();
      });
    });

    after(function(done){
      async.eachSeries([doc0, doc1, doc2], function(doc, cb){
        request.del({ url: rurl(doc['@id']), auth: auth }, cb);
      }, function(){
        request.del({url: rurl('users/user_a'), auth: auth}, done);
      });
    });
  });

});
