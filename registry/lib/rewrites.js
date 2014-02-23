module.exports = [
  { from: '/all', to: '/_view/byNameAndVersion', method: 'GET', query: {descending: 'true', reduce: 'false'}},

  { from: '/versions/:name', to: '/_list/versions/byNameAndVersion', method: 'GET',
    query: {reduce: 'false', startkey: [':name'], endkey: [':name', '\ufff0'], include_docs:'false'} },

  { from: "/maintainers/:ctnr_id", to: "/_update/maintainers/:ctnr_id", method: "PUT" },

  { from: '/:name/latest', to: '/_list/latest/byNameAndVersion', method: 'GET',
    query: {reduce: 'false', descending: 'true', startkey: [':name', '\ufff0'], endkey: [':name'], limit: '1', include_docs:'true'} },


  {from: '/search', to: '/_list/search/byKeyword', method: 'GET', query: {reduce: 'false'}},
  //{ from: '/search', to: '/_view/byKeyword', method: 'GET', query: {reduce: 'false'}},

  { from: '/:ctnr_id', to: '/_show/container/:ctnr_id', method: 'GET' },
  { from: '/first/:ctnr_id', to: '/_show/container/:ctnr_id', method: 'GET' },
  { from: '/:ctnr_id/dataset/:dataset', to: '/_show/dataset/:ctnr_id', method: 'GET' },
  { from: '/:ctnr_id/code/:code', to: '/_show/code/:ctnr_id', method: 'GET' },
  { from: '/:ctnr_id/figure/:figure', to: '/_show/figure/:ctnr_id', method: 'GET' }
];
