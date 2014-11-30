#!/bin/bash

export COUCH_PROTOCOL=http:
export COUCH_HOST=127.0.0.1
export COUCH_PORT=5984
export COUCH_ADMIN_USER=seb
export COUCH_ADMIN_PASS=seb
export COUCH_DB_NAME=registry
export NODE_HOST=localhost
export NODE_PORT_HTTP=3000
export NODE_PORT_HTTPS=4000
export CREDENTIAL_KEY=config/dcat.key
export CREDENTIAL_CERT=config/certificate-68165.crt
export CREDENTIAL_CA=config/GandiStandardSSLCA.pem
export CREDENTIAL_AWS=config/aws.json
export S3_BUCKET=dcat
