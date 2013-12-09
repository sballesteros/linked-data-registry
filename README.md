datapackage registry
====================

A CouchDB powered data registry for data packaged in
[data packages](http://dataprotocols.org/data-packages/).

Inspired by the [npm registry](https://github.com/isaacs/npmjs.org)
but different because:

- each resource of a datapackage has it's own URL
- you do not necessarily install a datapackage as a dependency
- if a resource has some [json-ld](http://json-ld.org/) we can do cool semantic stuff

A client is in development [here](https://github.com/standard-analytics/dpm-stan).


API
===

### PUT /adduser/:name

Create an user of username ```name```


### PUT /publish/:dpkgname/:version

Publish a specific ```version``` of the datapackage of name ```dpkgname```


### DELETE /unpublish/:dpkgname/:version?

Delete datapackage of name ```dpkgname``` and version
```version```. If version is omitted all the versions are deleted.


### GET /owner/ls/:dpkgname

List the maintainers of datapackage of name ```dpkgname```


### POST /owner/add

data:

    {
      username: username,
      dpkgName: dpkgname
    }


Add maintainer ```name``` to the datapackage ```dpkgname```.

### POST /owner/rm

data:

    {
      username: username,
      dpkgName: dpkgname
    }

Remove maintainer ```name``` from the datapackage ```dpkgname```.


### GET /search?keys=["search", "terms"]

Search by keywords


### GET /install/:dpkgname/:version?

Download a datapackage of name ```dpkgname``` and version
```version```. If version is omitted the latest version is returned.

