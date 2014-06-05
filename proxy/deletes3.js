var AWS = require('aws-sdk')

var $HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
AWS.config.loadFromPath(path.join($HOME, 'certificate', 'aws.json'));

var bucket = 'standardanalytics';
var s3 = new AWS.S3({params: {Bucket: bucket}});


var deletor = {
  deleteObject: function (client, deleteParams) {
    client.deleteObject(deleteParams, function (err, data) {
      if (err) {
        console.log("delete err " + deleteParams.Key);
      } else {
        console.log("deleted " + deleteParams.Key);
      }
    });
  },
  listBuckets: function (client) {
    client.listBuckets({}, function (err, data) {
      var buckets = data.Buckets;
      var owners = data.Owner;
      for (var i = 0; i < buckets.length; i += 1) {
        var bucket = buckets[i];
        console.log(bucket.Name + " created on " + bucket.CreationDate);
      }
      for (var i = 0; i < owners.length; i += 1) {
        console.log(owners[i].ID + " " + owners[i].DisplayName);
      }
    });

  },

  deleteBucket: function (client, bucket) {
    client.deleteBucket({Bucket: bucket}, function (err, data) {
      if (err) {
        console.log("error deleting bucket " + err);
      } else {
        console.log("delete the bucket " + data);
      }
    });
  },

  clearBucket: function (client, bucket) {
    var self = this;
    client.listObjects({Bucket: bucket}, function (err, data) {
      if (err) {
        console.log("error listing bucket objects "+err);
        return;
      }
      var items = data.Contents;
      for (var i = 0; i < items.length; i += 1) {
        var deleteParams = {Bucket: bucket, Key: items[i].Key};
        self.deleteObject(client, deleteParams);
      }
    });
  }
};

deletor.clearBucket(s3, bucket);
