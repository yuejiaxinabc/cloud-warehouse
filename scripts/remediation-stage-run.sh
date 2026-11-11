#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/cw-remediation-stage-20261111
pkill -f 'next start -p 3106' >/dev/null 2>&1 || true
sleep 2
nohup ./node_modules/.bin/next start -p 3106 -H 127.0.0.1 > /tmp/stage-3106.log 2>&1 &
for i in $(seq 1 45); do
  if curl -sf -o /dev/null http://127.0.0.1:3106/login; then echo READY; break; fi
  sleep 2
done
curl -s -o /dev/null -w 'stage_login=%{http_code}\n' http://127.0.0.1:3106/login
node scripts/remediation-http-regression.cjs 2>&1 | tail -50
