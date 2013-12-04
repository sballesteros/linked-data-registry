var modules = require('./lib/modules');

var ddoc = module.exports = {
  _id:'_design/registry',
  rewrites: require("./lib/rewrites"),
  shows: require("./lib/shows"),
  lists: require("./lib/lists"),
  views: require("./lib/views"),
  language: "javascript"
};


for(var key in modules){
  ddoc[key] = modules[key];
}
