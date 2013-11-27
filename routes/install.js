var util = require("util");
var Transform = require("stream").Transform;

function Ldjsonify(options) {
  Transform.call(this, options);
  this._writableState.objectMode = true;
  this._readableState.objectMode = false;
};

util.inherits(Ldjsonify, Transform);

Ldjsonify.prototype._transform = function(chunk, encoding, done){
  this.push(JSON.stringify(chunk.data)+ '\n');  
  done();
};

function streamResource(req, res, next){
  var name = req.params.name;
  var version = req.params.version.split('.');
  var resource = req.params.resource;

  var s = req.app.get('data').find(
    {
      name: name,
      'version.0': version[0],
      'version.1': version[1],
      'version.2': {$lte: version[2]},
      resource: resource
    },
    {data:true, _id:false}).stream();
  
  s.pipe(new Ldjsonify).pipe(res);
  s.on('error', function(err){
    throw err;
  });
};

module.exports = streamResource;
