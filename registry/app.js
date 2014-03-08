var modules = require('./lib/modules');

var ddoc = module.exports = {
  _id:'_design/registry',
  rewrites: require("./lib/rewrites"),
  shows: require("./lib/shows"),
  lists: require("./lib/lists"),
  views: require("./lib/views"),
  fulltext: require("./lib/fulltext"), //vanilla couchdb
  indexes: require("./lib/indexes"), //cloudant
  updates: require("./lib/updates"),
  validate_doc_update: require("./lib/validate_doc_update"),
  language: "javascript"
};

for(var key in modules){
  ddoc[key] = modules[key];
};
