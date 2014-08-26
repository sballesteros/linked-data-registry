linked data registry
====================

A [CouchDB](http://couchdb.apache.org/) powered registry for linked data.

[![NPM](https://nodei.co/npm/linked-data-registry.png)](https://nodei.co/npm/linked-data-registry/)

Inspired by the [npm registry](https://github.com/isaacs/npmjs.org)
but different because:

- build from the start for [linked data](http://en.wikipedia.org/wiki/Linked_data)
- documents are served as [JSON-LD](http://json-ld.org) or [JSON interpreded as JSON-LD](http://json-ld.org/spec/latest/json-ld/#interpreting-json-as-json-ld) and using the semantic of [schema.org](http://schema.org)
- semantic search is supported

A client is available [here](https://github.com/standard-analytics/ldpm).

Registry API
============

### GET /

Return a [JSON-LD](http://www.w3.org/TR/json-ld) document describing
the registry and its potential action using
[schema.org](http://schema.org).

### PUT /users/{username}

Register an user.

request body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@id": "users/{username}"
      "@type": "Person",
      "password": "secret"
      "name": "John Markup",
      "email": "mailto:johnmarkup@example.com",
      ...
    }

response body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@type": "RegisterAction",
      "actionStatus": "CompletedActionStatus",
      "agent": "users/{username}",
      "object": "https://registry.standardanalytics.io"
    }

### DELETE /users/{username}

Unregister an user.

required header:
- Authorization

response body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@type": "UnRegisterAction",
      "actionStatus": "CompletedActionStatus",
      "agent": "users/{username}",
      "object": "https://registry.standardanalytics.io"
    }


### GET /users/{username}

Get a user public profile.

### PUT /{namespace}

Create a new [JSON-LD](http://www.w3.org/TR/json-ld) document of
```@id``` ```{namespace}```.

If a [```version```](http://schema.org/version) property is specified in the
document, the document will be versionned that is each update will
require a new version value to be published. When appropriate version
number SHOULD follow [semantic versionning](http://semver.org/).

If a [```version```](http://schema.org/version) property is not specified, the
new document will replace the previous version irreversibly.

required header:
- Authorization

request body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@id": "{namespace}",
      ...
    }

Note to be valid a document need at least:
- a ```@context``` of value ```https://registry.standardanalytics.io/context.jsonld```
- an ```@id```

response body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@type": "CreateAction",
      "actionStatus": "CompletedActionStatus",
      "agent": "users/{username}",
      "result": "namespace"
    }

### DELETE /{namespace}{?version}

Delete a document of ```@id``` ```{namespace}``` and version
```{version}```. If version is omitted all the versions will be
deleted.

required header:
- Authorization

response body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@type": "DeleteAction",
      "actionStatus": "CompletedActionStatus",
      "agent": "users/john",
      "object": "{namespace}{?version}",
      "collection": "{namespace}"
    }


### GET /{namespace}/{+pathorurl}{?version}

Get a [JSON-LD](http://www.w3.org/TR/json-ld) document of ```@id```
```{namespace}``` or a node of this document of ```@id```
```{namespace}/{pathorurl}``` or ```{pathorurl}```.

A specific version can be specified using a query string parameter
```version``` whose value is properly encoded as a Uniform Resource
Identifier (URI) component (e.g with encodeURIComponent). In case the
document is versionned following
[Semantic Versioning](http://semver.org/), a range (e.g) ```<0.0.1```
can be specified as ```version```.

If ```{?version}``` is omitted, the latest version of the document is
returned.


Depending on the ```Accept``` header, documents retrieved from the
registry can be served as
[JSON-LD](http://www.w3.org/TR/json-ld/#application-ld-json)
(expanded, compacted or flattened) or,
[JSON interpreted as JSON-LD](http://www.w3.org/TR/json-ld/#interpreting-json-as-json-ld).

### GET /maintainers/ls/{namespace}

List the maintainers of package of [JSON-LD](http://www.w3.org/TR/json-ld) document of ```@id``` {namespace}.

response body:

    {
      "@context": "http://registry.standardanalytics.io",
      "@id": "{namespace}",
      "accountablePerson": [
        { "@id": "users/john", "@type": "Person", "name": "John Markup", "email": "mailto:user@domain.io" },
        ...
      ]
    }

### POST /maintainers/add/{username}/{namespace}

required header:
- Authorization

response body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@type": "RegisterAction",
      "actionStatus": "CompletedActionStatus",
      "agent": "users/{username}",
      "object": "{namespace}"
    }


### POST /maintainers/rm/{username}/{namespace}

required header:
- Authorization

response body:

    {
      "@context": "https://registry.standardanalytics.io/context.jsonld",
      "@type": "UnRegisterAction",
      "actionStatus": "CompletedActionStatus",
      "agent": "users/{username}",
      "object": "{namespace}"
    }


Raw data storage API
====================

### PUT /r/{sha1}

Publish a resource whose SHA-1 message digest (encoded in hex) is {sha1}.

required headers:
- Authorization
- Content-MD5
- Content-Type
- Content-Length
- Encoding (if any)

### GET /r/{sha1}

Retrieve raw data.


Tests
=====

You need couchdb running with an admin defined in ```env.sh``` (```COUCH_ADMIN_USER``` and ```COUCH_ADMIN_PASS```) (see ```env.sh```)

    couchdb
    source env.sh
    npm run init
    npm run push
    npm start
    npm test

License
=======

Apache 2.0.
