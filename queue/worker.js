var util = require('util')
  , path = require('path')
  , AWS = require('aws-sdk')
  , postPublish = require('./lib/postpublish')
  , nano = require('nano');

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});

var couch = {
  ssl: process.env['COUCH_SSL'],
  host: process.env['COUCH_HOST'],
  port: process.env['COUCH_PORT'],
  registry: (process.env['REGISTRY_DB_NAME'] || 'registry')
};

var sqsQueueName = process.env['QUEUE_NAME'];

var admin = { username: process.env['COUCH_USER'], password: process.env['COUCH_PASS'] };

var rootCouch = util.format('%s://%s:%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port) //https is optional so that we can play localy without SSL. That being said, in production it should be 1!
  , rootCouchAdmin = util.format('%s://%s:%s@%s:%d', (couch.ssl == 1) ? 'https': 'http', admin.username, admin.password, couch.host, couch.port)
  , rootCouchRegistry = util.format('%s://%s:%s/%s', (couch.ssl == 1) ? 'https': 'http', couch.host, couch.port, couch.registry);

var nano = require('nano')(rootCouchAdmin); //connect as admin
var registry = nano.db.use(couch.registry)

var sqs = new AWS.SQS();

s3.createBucket(function(err, data) {
  if(err) throw err;
  console.log('S3 bucket (%s) OK', bucket);

  sqs.getQueueUrl({QueueName: sqsQueueName}, function(err, data){
    if(err) throw err;

    var queueUrl = data.QueueUrl;

    if(!queueUrl.length) throw new Error('could not get queue');

    console.log('queue "%s" at: %s', sqsQueueName, queueUrl);

    function processMsg(){

      sqs.receiveMessage({QueueUrl: queueUrl}, function(err, data){
        if(err){
          console.error('error receiving message from queue: ', err);
          return setTimeout(processMsg, 10000);
        }

        if(!data.Messages || !(data.Messages && data.Messages.length)){
          return setTimeout(processMsg, 10000);
        }

        var msg = data.Messages[0];

        postPublish({rootCouchRegistry: rootCouchRegistry, admin: admin, s3: s3}, JSON.parse(msg.Body), function(err, pkg, rev){

          if(err){
            console.error('error during postpublish processing: ', err);
            return sqs.deleteMessage({QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle}, function(err, data) {
              processMsg();
            });
          }

          registry.atomic('registry', 'postpublish', pkg._id, pkg, function(err, bodyPost, headersPost){
            if(err){
              console.error('error during postpublish: ', err, bodyPost, headersPost);
            }
            sqs.deleteMessage({QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle}, function(err, data) { processMsg(); });
          });

        });

      });
    };

    processMsg();

  });

});


//it('should have added about', function(done){
//  request.get(rurl('/test-readme/0.0.0'), function(err, resp, body){
//    body = JSON.parse(body);
//    assert.deepEqual(body.about, { name: 'README.md', url: 'test-readme/0.0.0/about/README.md' });
//    done();
//  });
//});
//
////test dataset
//assert.equal(body.dataset[1].distribution.hashValue, crypto.createHash('sha1').update(JSON.stringify(pkg.dataset[0].distribution.contentData)).digest('hex'));
//zlib.gzip(JSON.stringify(pkg.dataset[0].distribution.contentData), function(err, data){
//  var sha1 = crypto.createHash('sha1').update(data).digest('hex');
//  assert.equal(body.dataset[1].distribution.encoding.hashValue, sha1);
//  assert.equal(body.dataset[1].distribution.contentUrl, 'r/' + sha1);
//  done();
//})
//
//
//assert.equal(body.thumbnailUrl, 'test-pkg/0.0.0/thumbnail/thumb-fig-256.jpeg');
