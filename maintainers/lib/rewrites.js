module.exports = [
  { from: 'doc/:namespace', to: '/_list/maintainers/permissions', method: 'GET',
    query: {reduce: 'false', key: [":namespace", "w"], include_docs: 'false'} },

  { from: "/maintains/:_id", to: "/_show/maintains/:_id", method: "GET" },
  { from: "/user/:_id", to: "/_show/user/:_id", method: "GET" },

  { from: "/create/:_id", to: "/_update/create/:_id", method: "PUT" },
  { from: "/add/:_id", to: "/_update/add/:_id", method: "PUT" },
  { from: "/rm/:_id", to: "/_update/rm/:_id", method: "PUT" }
];
