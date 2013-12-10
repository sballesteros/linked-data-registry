module.exports = [
  { from: '/:name', to: '/_list/maintainers/maintainers', method: 'GET',
    query: {reduce: 'false', key: ':name', limit: '1'} },

  { from: "/create/:id", to: "/_update/create/:id", method: "PUT" }
];
