var Writable = require('stream').Writable
  , util = require('util')
  , crypto = require('crypto')
  , Coercitor = require('jts-validator')
  , split = require('split');

function StreamToMongo(collection, tags, nStart) {

  Writable.call(this, {objectMode: true});
  this._collection = collection;
  this._row = tags;
  this._nRow = 0;
  this._nStart = nStart || 0;
}

util.inherits(StreamToMongo, Writable);

StreamToMongo.prototype._write = function (obj, encoding, done) {
  this._row.data = obj;
  delete this._row._id; //otherwise same _id is recycled => error

  this._nRow++;
  if(this._nRow > this._nStart){
    this._collection.insert(this._row, { w: 1 }, done);
  } else {
    done();
  }

};


function publishDpkg(req, res, next){
  var col = req.app.get('dpkg');
  var dpkg = req.body;
  dpkg.version = dpkg.version.split('.');

  function terminate(){
    //remove data from resources:
    dpkg.resources.forEach(function(r){
      ['path', 'url', 'data'].forEach(function(p){
        if(p in r){
          delete r[p];
        }
      });
    });
    dpkg._ok = false; //will be set to true ONLY when all the resources have been streamed...
    
    col.update({name: dpkg.name, version: dpkg.version}, dpkg, {w:1}, function(err){
      if(err) throw err;
      req.session.name = dpkg.name;
      req.session.version = dpkg.version;
      req.session.resource = dpkg.resources[0].name;
      res.status(206).json({'resource': dpkg.resources[0].name});
    });
  };
  
  //insert new dpkg. To avoid race conditions, first mark publication intention by only setting the name
  col.findAndModify({name: dpkg.name, version: dpkg.version}, [], {$set: {name: dpkg.name, version: dpkg.version}}, {upsert:true}, function(err, doc){

    if(doc._ok){
      return res.status(200).json({'msg': 'a data package with this name and version already exists'});
    }

    if(doc._ok === false) { //smtg went wrong previously, erase everything and start from scratch
      req.app.get('data').remove({name: dpkg.name, version: dpkg.version}, function(err, cnt){
        console.log(cnt);
        terminate();
      });
    } else {
      terminate();
    }

  });
};


function publishStream(req, res, next){

  if( !(req.session.name && req.session.version && req.session.resource) ){
    return res.status(400).json({'msg': 'fail'});    
  }

  var tags = {
    name: req.session.name,
    resource: req.session.resource,
    version: req.session.version
  };

  req.app.get('dpkg').findOne({name: tags.name, version: req.session.version}, {resources:true}, function(err, doc){
    var resources = doc.resources.map(function(x){ return x.name});
    var resourceInd = resources.indexOf(tags.resource);
    var schema = doc.resources[resourceInd].schema;

    var streamToMongo = new StreamToMongo(req.app.get('data'), tags); //TODO nStart from _length of previous PATCH version
    var shasum = crypto.createHash('sha1');

    req
      .pipe(split(function(row){
        if(row) {
          shasum.update(row);
          return JSON.parse(row);
        }
      }))
      .pipe(new Coercitor(schema))
      .pipe(streamToMongo)
      .on('error', function(err){
        throw err;
      })
      .on('finish', function(){

        var d = shasum.digest('hex');
        var upd = {};
        upd['resources.' + resourceInd + '._length'] =  streamToMongo._nRow;
        upd['resources.' + resourceInd + '._shasum'] =  d;

        if(tags.resource === resources[resources.length-1]){
          upd['_ok'] = true
          req.app.get('dpkg').update({name: tags.name, version: req.session.version}, {$set: upd}, {w:1}, function(err){
            if(err) throw err;
            res.session = null;
            res.status(200).json({'msg': 'done'});
          });        
        } else {
          req.app.get('dpkg').update({name: tags.name, version: req.session.version}, {$set: upd}, {w:1}, function(err){
            if(err) throw err;
            req.session.resource = req.session.names[resourceInd + 1];
            res.status(206).json({resource: req.session.resource});
          });        
        }

      });

  });  


};



exports.stream = publishStream;
exports.dpkg = publishDpkg;
