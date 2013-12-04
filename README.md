datapackage registry
====================

A CouchDB powered data registry for small (~ 200Mo) data packaged in
[data packages](http://dataprotocols.org/data-packages/).

Inspired by the [npm registry](https://github.com/isaacs/npmjs.org)
but different because:

- each resource of a datapackage has it's own URL
- you do not necessarily install a datapackage as a dependency
- if a resource has some [json-ld](http://json-ld.org/) we can do cool semantic stuff

A client is in development [here](https://github.com/standard-analytics/dpm-stan).
