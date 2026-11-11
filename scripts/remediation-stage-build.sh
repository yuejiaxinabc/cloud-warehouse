#!/usr/bin/env bash
set -Eeuo pipefail
STAGE=/opt/cw-remediation-stage-20261111
cd "$STAGE"
node scripts/remediation-migrate.cjs
./node_modules/.bin/prisma generate
NODE_OPTIONS=--max-old-space-size=2048 ./node_modules/.bin/next build 2>&1 | tail -6
echo BUILD_DONE
