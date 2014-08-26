linked package registry
=======================

A [CouchDB](http://couchdb.apache.org/) powered registry for linked data packages.

Inspired by the [npm registry](https://github.com/isaacs/npmjs.org)
but different because:

- build from the start for [linked data](http://en.wikipedia.org/wiki/Linked_data)
- packages are served as [JSON-LD](http://json-ld.org) or [JSON interpreded as JSON-LD](http://json-ld.org/spec/latest/json-ld/#interpreting-json-as-json-ld) and using the semantic of [schema.org](http://schema.org)
- semantic search is supported

A client is in development [here](https://github.com/standard-analytics/ldpm).

Tests
=====

You need couchdb running with an admin with username:seb, password:seb

    couchdb
    npm run init
    npm run push
    npm start
    npm test

License
=======

Apache 2.0.
