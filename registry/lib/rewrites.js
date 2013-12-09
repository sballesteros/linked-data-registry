module.exports = [
  { from: '/all', to: '/_view/byNameAndVersion', method: 'GET', query: {descending: 'true', reduce: 'false'}},
  { from: '/:name/latest', to: '/_list/latest/byNameAndVersion', method: 'GET',
    query: {reduce: 'false', descending: 'true', startkey: [':name', '\ufff0'], endkey: [':name'], limit: '1', include_docs:'true'} },

  {from: '/search', to: '/_list/search/byKeyword', method: 'GET', query: {reduce: 'false'}},
  //{ from: '/search', to: '/_view/byKeyword', method: 'GET', query: {reduce: 'false'}},

  { from: '/:dpkg_id', to: '/_show/datapackage/:dpkg_id', method: 'GET' },
  { from: '/first/:dpkg_id', to: '/_show/datapackage/:dpkg_id', method: 'GET' },
  { from: '/:dpkg_id/:resource', to: '/_show/resource/:dpkg_id', method: 'GET' },

  { from: "/maintainers/:dpkg_id", to: "/_update/maintainers/:dpkg_id", method: "PUT" }
];
