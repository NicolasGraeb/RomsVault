#!/bin/sh
set -eu
# Credentials are interpolated into JSON; restrict them to URL-safe characters.
case "$AWS_ACCESS_KEY_ID$AWS_SECRET_ACCESS_KEY" in
  *[!a-zA-Z0-9_-]*) echo 'S3 credentials must use letters, digits, hyphens or underscores' >&2; exit 1;;
esac
test -n "$AWS_ACCESS_KEY_ID" && test -n "$AWS_SECRET_ACCESS_KEY"
umask 077
printf '{"identities":[{"name":"romvault","credentials":[{"accessKey":"%s","secretKey":"%s"}],"actions":["Admin","Read","Write","List","Tagging"]}]}' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" > /tmp/s3.json
mkdir -p /data/filer
exec weed -config_dir=/etc/seaweedfs server \
  -ip=seaweedfs -ip.bind=0.0.0.0 -dir=/data \
  -master.volumeSizeLimitMB=1024 -volume.max=0 \
  -volume.index="${SEAWEED_VOLUME_INDEX:-memory}" \
  -filer -s3 -s3.config=/tmp/s3.json \
  -s3.concurrentFileUploadLimit="${SEAWEED_UPLOAD_LIMIT:-2}"
