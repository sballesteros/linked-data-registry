module.exports = [
  { from: '/:name', to: '/_list/maintainers/maintainers', method: 'GET',
    query: {reduce: 'false', key: ':name', limit: '1'} },
];
