module.exports = [
  { from: '/all', to: '/_view/byId', method: 'GET',
    query: {descending: 'true', reduce: 'true', group: 'true'} },

  { from: '/all/:id', to: '/_view/byId', method: 'GET',
    query: {reduce: 'false', key: ':id', include_docs: 'false'} },

  { from: '/latestview/:id', to: '/_view/byIdAndVersion', method: 'GET',
    query: {reduce: 'false', descending: 'true', startkey: [':id', '\ufff0'], endkey: [':id'], limit: '1', include_docs:'false'} },

  { from: '/latest/:id', to: '/_list/latest/byIdAndVersion', method: 'GET',
    query: {reduce: 'false', descending: 'true', startkey: [':id', '\ufff0'], endkey: [':id'], limit: '1', include_docs:'true'} },

  { from: '/latest/:id/:part_id', to: '/_list/latestPart/byIdAndVersion', method: 'GET',
    query: {reduce: 'false', descending: 'true', startkey: [':id', '\ufff0'], endkey: [':id'], limit: '1', include_docs:'true'} },

  { from: '/vtag/:id', to: '/_view/vtag', method: 'GET',
    query: {reduce: 'false', key: ':id', include_docs: 'false'} },

  { from: '/rmvtag/:_id', to: '/_update/vtag/:_id', method: 'PUT' },

  { from: '/sha1/:sha1', to: '/_view/bySha1', method: 'GET',
    query: {reduce: 'true', key: ':sha1', group: 'true'} },

  { from: '/show/:id', to: '/_show/doc/:id', method: 'GET' },
  { from: '/show/:id/:part_id', to: '/_show/part/:id/:part_id', method: 'GET' },

  { from: "/update/:_id", to: "/_update/body/:_id", method: "PUT" },
  { from: '/search', to: '/_view/byKeyword', method: 'GET'},
];
