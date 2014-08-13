module.exports = [
  { from: 'doc/:namespace', to: '/_list/maintainers/maintainers', method: 'GET',
    query: {reduce: 'false', key: ':namespace', limit: '1'} },

  { from: "/create/:id", to: "/_update/create/:id", method: "PUT" },
  { from: "/add/:id", to: "/_update/add/:id", method: "PUT" },
  { from: "/rm/:id", to: "/_update/rm/:id", method: "PUT" }
];
