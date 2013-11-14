var Writable = require('stream').Writable
  , util = require('util')
  , split = require('split');

function StreamToMongo(collection, tags) {
  Writable.call(this, {objectMode: true});
  this._collection = collection;
  this._row = tags;
}

util.inherits(StreamToMongo, Writable);

StreamToMongo.prototype._write = function (obj, encoding, done) {
  this._row.data = obj;
  delete this._row._id; //otherwise same _id is recycled => error

  this._collection.insert(this._row, { w: 1 }, function(err){
    if(err) throw err;
    done();
  });
};


function publishDpkg(req, res, next){
  var col = req.app.get('dpkg');
  var dpkg = req.body;
  
  //insert new dpkg. To avoid race conditions, first mark publication intention by only setting the name
  col.findAndModify({name: dpkg.name, version: dpkg.version}, [], {$set: {name: dpkg.name}}, {upsert:true}, function(err, doc){
    if(doc._ok){
      return res.send({'msg': 'already published'});
    }

    //remove data from resources:
    dpkg.resources.forEach(function(r){
      ['path', 'url', 'data'].forEach(function(p){
        if(p in r){
          delete r[p];
        }
      });
    });
    dpkg._ok = false; //will be set to true ONLY when all the resources have been streamed...

    col.update({name: dpkg.name}, dpkg, {w:1}, function(err){
      req.session.name = dpkg.name;
      req.session.version = dpkg.version;
      req.session.resource = dpkg.resources[0].name;
      req.session.resources = dpkg.resources.map(function(x){return x.name});
      res.send({'resource': dpkg.resources[0].name});
    });
  });
};


function publishStream(req, res, next){
  var collection = req.app.get('data');

  if( !(req.session.name && req.session.version && req.session.resource && req.session.resources.length) ){
    return res.send({'msg': 'fail'});    
  }

  var tags = {
    name: req.session.name,
    resource: req.session.resource,
    version: req.session.version.split('.').slice(0,2).join('.')
  };

  var streamToMongo = new StreamToMongo(collection, tags);

  req
    .pipe(split(function(row){
      if(row) {
        return JSON.parse(row);
      }
    }))
    .pipe(streamToMongo)
    .on('finish', function(){

      if(tags.resource === req.session.resources[req.session.resources.length-1]){
        req.app.get('dpkg').update({name: tags.name, version: req.session.version}, {$set: {_ok: true}}, {w:1}, function(err){
          if(err) throw err;
          res.session = null;
          res.send({'msg': 'done'});
        });        
      } else {
        req.session.resource = req.session.names[req.session.names.indexOf(tags.name) + 1];
        res.send({resource: req.session.resource});
      }
      
    });
};



exports.stream = publishStream;
exports.dpkg = publishDpkg;
