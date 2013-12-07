var modules = require('./lib/modules');

var ddoc = module.exports = {
  _id:'_design/maintainers',
  validate_doc_update: require("./lib/validate_doc_update.js"),
  shows: require("./lib/shows.js"),
  updates: require("./lib/updates.js"),
  language: "javascript"
};

for(var key in modules){
  ddoc[key] = modules[key];
}
