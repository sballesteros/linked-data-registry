module.exports = [
  { from: '/all', to: '/_view/byId', method: 'GET',
    query: {descending: 'true', reduce: 'true', group: 'true'} },

  { from: '/all/:id', to: '/_view/byId', method: 'GET',
    query: {reduce: 'false', key: ':id', include_docs: 'false'} },

  { from: '/versions/:id', to: '/_list/versions/byIdAndVersion', method: 'GET',
    query: {reduce: 'false', startkey: [':id'], endkey: [':id', '\ufff0'], include_docs: 'false'} },

  { from: '/latest/:id', to: '/_list/latest/byIdAndVersion', method: 'GET',
    query: {reduce: 'false', descending: 'true', startkey: [':id', '\ufff0'], endkey: [':id'], limit: '1', include_docs:'true'} },

  { from: '/sha1/:sha1', to: '/_view/bySha1', method: 'GET',
    query: {reduce: 'true', key: ':id', group: 'true'} },

  { from: '/show/:id', to: '/_show/doc/:id', method: 'GET' },
  { from: '/show/:id/:part_id', to: '/_show/part/:id/:part_id', method: 'GET' }
];
