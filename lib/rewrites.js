module.exports = [
  { from: "/all", to: "/_view/byNameAndVersion", method: "GET", query: {descending: 'true'}},

  { from: "/:dpkg_id", to: "/_show/datapackage/:dpkg_id", method: "GET" },
  { from: "/:dpkg_id/:resource", to: "/_show/resource/:dpkg_id", method: "GET" }
];
