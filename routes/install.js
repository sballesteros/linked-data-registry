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

module.exports = Ldjsonify;

function streamResource(req, res, next){
  var name = req.params.name;
  var version = req.params.version.split('.');
  var resource = req.params.resource;

  var s = req.app.get('data').find({name: name, version: version, resource: resource}, {data:true, _id:false}).stream();
  s.pipe(new Ldjsonify).pipe(res);
  s.on('error', function(err){
    return next(err);
  });

};

module.exports = streamResource;
