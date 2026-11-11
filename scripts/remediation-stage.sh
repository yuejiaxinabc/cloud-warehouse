#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
APP=/opt/cloud-warehouse
STAGE=/opt/cw-remediation-stage-20261111
if [ -e "$STAGE" ]; then echo 'Stage exists; inspect before reuse'; exit 1; fi
mkdir -p "$STAGE"
cp -a "$APP/node_modules" "$STAGE/node_modules"
rsync -a --exclude node_modules --exclude .next --exclude '.next.prev-*' --exclude '.git' --exclude '.env*' --exclude '..env*' --exclude 'public/uploads' "$APP/" "$STAGE/"
node /tmp/cw-create-stage.cjs
printf 'STAGE_READY=%s\n' "$STAGE"
