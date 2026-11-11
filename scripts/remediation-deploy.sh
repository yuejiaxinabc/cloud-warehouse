#!/usr/bin/env bash
set -Eeuo pipefail
APP=/opt/cloud-warehouse
cd "$APP"
echo '=== 0 backup marker ==='
cat /root/cw-remediation-backups/latest
echo '=== 1 prisma generate ==='
./node_modules/.bin/prisma generate 2>&1 | tail -3
echo '=== 2 additive migration ==='
node scripts/remediation-migrate.cjs
echo '=== 3 permission catalogue ==='
node scripts/remediation-permissions.cjs
echo '=== 4 build ==='
NODE_OPTIONS=--max-old-space-size=2048 ./node_modules/.bin/next build 2>&1 | tail -5
echo '=== 5 restart ==='
systemctl restart cloud-warehouse
for i in $(seq 1 30); do curl -sf -o /dev/null http://127.0.0.1:3000/login && break; sleep 2; done
systemctl is-active cloud-warehouse
curl -s -o /dev/null -w 'prod_login=%{http_code}\n' http://127.0.0.1:3000/login
echo DEPLOY_DONE
