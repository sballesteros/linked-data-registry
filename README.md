datapackage registry
====================

A CouchDB powered data registry for [data packages](http://dataprotocols.org/data-packages/).

Inspired by the [npm registry](https://github.com/isaacs/npmjs.org)
but different because:

- each resource of a datapackage has it's _own URL_
- semantic search for resource having [json-ld](http://json-ld.org/) is supported

A client is in development [here](https://github.com/standard-analytics/dpm-stan).


API
===


### GET /:dpkgname/:version?

Download a datapackage of name ```dpkgname``` and version
```version```. If version is omitted the latest version is returned.

### GET /:dpkgname/:version/:resourcename

Download the resource with name ```resourcename``` from the
datapackage with name ```dpkgname``` and version ```version```.

if ```?meta=true``` is added, returns only the meta information (i.e
everything but the data of the resource)

### PUT /adduser/:name

data:

    {
      name: name,
      salt: salt,
      password_sha: sha(password+salt),
      email: email
    }
    
Create an user of username ```name```.


### PUT /:dpkgname/:version

data: Document with attachments in multipart/related format as needed by CouchDb. See
[CouchDB multiple attachments](http://docs.couchdb.org/en/latest/api/document/common.html#creating-multiple-attachments)
for details.

Publish a specific ```version``` of the datapackage of name ```dpkgname```.


### DELETE /:dpkgname/:version?

Delete datapackage of name ```dpkgname``` and version
```version```. If version is omitted all the versions are deleted.


### GET /owner/ls/:dpkgname

List the maintainers of datapackage of name ```dpkgname```.


### POST /owner/add

data:

    {
      username: name,
      dpkgName: dpkgname
    }


Add maintainer ```name``` to the datapackage ```dpkgname```.

### POST /owner/rm

data:

    {
      username: name,
      dpkgName: dpkgname
    }

Remove maintainer ```name``` from the datapackage ```dpkgname```.


### GET /search?keys=["search", "terms"]

Search by keywords.



