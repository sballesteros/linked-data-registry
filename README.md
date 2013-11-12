data-registry
=============

A mongodb powered data registry ("optimised" for
[SDF](http://dataprotocols.org/simple-data-format/)) for data
described in [data packages](http://dataprotocols.org/data-packages/).

3 main collections:

- dpkg
- data
- changes

#semver for cumulative data

The data registry uses a special interpretation of
[semantic versioning](http://semver.org/).

A version number is composed of MAJOR.MINOR.PATCH.

- MAJOR: adding or deleting resources, or changing schemas,
- MINOR: correcting the data (i.e changing values or resolving previously missing values)
- PATCH: appending data (adding new data points)

##dpkg

The dpkg collection store the data packages descriptions (everything but the resources data).

Typicaly an user will:

1. query the dpkg collection to get the datapackage of interest
2. request the corresponding data in the data collection


##data

the data collection contains documents of the form:

    {
      "_id": "uniqueID",
      "name": "datapackage name (unique)",
      "resource": "resource_name",
      "version": "MAJOR.MINOR",
      "data": {the data}
    }
    
Note that PATCH is ommitted in version.

##changes

This collection follows [SLEEP](http://dataprotocols.org/sleep/)

    { 
      _id: "for internal use"
      "name": "datapackage name (unique)",
      "resource": "resource_name",
      "version": "MAJOR.MINOR",
      "seq": 10, 
      "id": "uniqueID (_id of the data collection)", 
      "deleted": false, 
      "data": { } 
    }

