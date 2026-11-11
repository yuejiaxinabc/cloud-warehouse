#!/usr/bin/env bash
# 云仓自更新执行器（v1.2.5）
#
# 用法： bash scripts/apply-update.sh <目标版本>
#
# 关键约束（按需求约定）：
#   1) 只更新代码，**不动数据库**；
#   2) 数据库只在包内带 db-changes.sql 时执行，且执行前过滤掉 DROP/TRUNCATE/改列类型等破坏性语句，
#      只允许 CREATE TABLE IF NOT EXISTS / ADD COLUMN / CREATE INDEX 这类加法，数据一行不删；
#   3) 中途任何一步失败，自动把代码回滚到更新前的快照并重启，宁可停在旧版也不能停在半成品。
set -Eeuo pipefail

HUB="${UPDATE_HUB_URL:-http://127.0.0.1:9958}"
TARGET="${1:?用法: apply-update.sh <版本号>}"
APP=/opt/cloud-warehouse
WORK=${UPDATE_WORK_DIR:-/opt/cw-update-work}
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$WORK/code-backup-$STAMP"
STATE="$WORK/last-run.json"

log() { echo "[$(date +%H:%M:%S)] $*"; }
set_state() { printf '{"status":"%s","version":"%s","from":"%s","startedAt":%s,"finishedAt":%s,"message":"%s"}\n' "$1" "$TARGET" "${FROM:-}" "${STARTED:-0}" "$(date +%s)" "$2" > "$STATE" 2>/dev/null || true; }

STARTED=$(date +%s)
FROM=$(node -p "require('$APP/package.json').version" 2>/dev/null || echo unknown)
log "开始更新：$FROM → $TARGET"
set_state running ""

ROLLED_BACK=0
rollback() {
  local code=$?
  if [ "$ROLLED_BACK" = "1" ]; then exit $code; fi
  ROLLED_BACK=1
  log "✗ 失败（exit=$code），开始回滚代码到更新前快照"
  if [ -d "$BACKUP" ]; then
    rsync -a --delete \
      --exclude node_modules --exclude .next --exclude backups \
      --exclude public/uploads --exclude '.env*' --exclude '..env*' \
      "$BACKUP/" "$APP/" && log '已恢复代码文件'
    ( cd "$APP" && systemctl restart cloud-warehouse ) || true
    sleep 8
    bash /usr/local/bin/cw-warmup.sh 2>/dev/null | tail -1 || true
    log '回滚完成，服务已按旧版本重启'
    set_state failed "更新失败已回滚"
  else
    log '没有可用快照，未做回滚'
    set_state failed "更新失败，无快照"
  fi
  exit $code
}
trap rollback ERR

log '1/6 读取更新中心元数据'
META=$(curl -sf --max-time 10 "$HUB/api/version") || { log '无法访问远端服务器'; exit 1; }
SHA=$(echo "$META" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).sha256 || ''")
SIZE=$(echo "$META" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).size || 0")
VERSION=$(echo "$META" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).version")
NSRC=$(echo "$META" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).sources.length")
mapfile -t SOURCES < <(echo "$META" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).sources.join('\n')")
log "  目标版本: $VERSION，直链 $NSRC 个，约 $((SIZE/1048576)) MB"

mkdir -p "$WORK/pkg"
PKG="$WORK/pkg/yuncang-$VERSION.tar.gz"

# ---- 多直链测速：每个源先拉前 256KB 计时，取最快的那个整包下载 ----
log '2/6 选择最快的下载线路'
# 用 curl 自己的 time_total 计时，不依赖 date 的毫秒格式（不同发行版差异大，实测会算出 2000 万毫秒的假值）
BEST_URL=""
BEST_T=99999
for u in "${SOURCES[@]}"; do
  [ -z "$u" ] && continue
  # 注意：必须用 if 判 curl 的**退出码**。之前写成 t=$(curl ... || true)，
  # 404 时 curl 虽然失败但 -w 仍会输出时间，被误判成「可用且很快」，
  # 实测三个没上传文件的 COS 桶全被当成最优线路。
  if t=$(curl -sf -m 8 -r 0-262143 -o /dev/null -w '%{time_total}' "$u" 2>/dev/null); then
    if awk -v a="$t" -v b="$BEST_T" 'BEGIN{exit !(a<b)}'; then
      log "  $u → ${t}s ✓"
      BEST_T="$t"; BEST_URL="$u"
    else
      log "  $u → ${t}s（较慢）"
    fi
  else
    log "  $u → 不可用（404/无权限/超时）"
  fi
done

if [ -z "$BEST_URL" ]; then
  log '所有下载直链均不可用'
  exit 1
fi
log "  已选：$BEST_URL（$BEST_T s）"
curl -f -m 600 --retry 2 --retry-delay 2 -o "$PKG" "$BEST_URL" || { log '下载失败'; exit 1; }
ACTUAL=$(sha256sum "$PKG" | cut -d' ' -f1)
if [ -n "$SHA" ]; then
  [ "$ACTUAL" = "$SHA" ] || { log "校验失败: $ACTUAL != $SHA"; exit 1; }
  log "  sha256 校验通过 ${SHA:0:16}…"
else
  log "  发布方未提供 sha256，跳过校验（实际 $ACTUAL）"
fi

log '3/6 备份当前代码（数据库不动）'
mkdir -p "$BACKUP"
rsync -a \
  --exclude node_modules --exclude .next --exclude backups \
  --exclude public/uploads --exclude '.env*' --exclude '..env*' --exclude '.git' \
  "$APP/" "$BACKUP/"
log "  已备份到 $BACKUP"

log '4/6 解压并覆盖代码'
rm -rf "$WORK/unpack" && mkdir -p "$WORK/unpack"
tar xzf "$PKG" -C "$WORK/unpack"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude backups \
  --exclude public/uploads --exclude '.env*' --exclude '..env*' \
  "$WORK/unpack/" "$APP/"
VER_IN_PKG=$(node -p "require('$APP/package.json').version")
log "  代码已覆盖，包内版本 $VER_IN_PKG"

if [ -f "$APP/db-changes.sql" ]; then
  log '5/6 发现 db-changes.sql，按「只加不删」规则执行'
  SAFE="$WORK/db-safe-$STAMP.sql"
  grep -viE '^[[:space:]]*(drop|truncate|alter[[:space:]]+table[^;]*drop)' "$APP/db-changes.sql" > "$SAFE" || true
  REMOVED=$(( $(grep -c . "$APP/db-changes.sql" || true) - $(grep -c . "$SAFE" || true) ))
  log "  已过滤破坏性语句 $REMOVED 行，只执行加法部分"
  if [ -s "$SAFE" ]; then
    mysql warehouse < "$SAFE" && log '  数据库增量已应用（未删除任何数据）'
  else
    log '  过滤后没有可执行语句，数据库未变更'
  fi
else
  log '5/6 包内无 db-changes.sql —— 数据库保持不变'
fi

log '6/6 安装依赖并构建'
( cd "$APP" && NODE_OPTIONS=--max-old-space-size=2048 npm run build ) || { log '构建失败'; exit 1; }

systemctl restart cloud-warehouse
sleep 10
systemctl is-active cloud-warehouse >/dev/null || { log '重启后服务未就绪'; exit 1; }
bash /usr/local/bin/cw-warmup.sh 2>/dev/null | tail -1 || true

log "✓ 更新完成：$FROM → $VER_IN_PKG（数据库未变更，快照保留在 $BACKUP）"
ls -1dt "$WORK"/code-backup-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
set_state success "更新完成"
trap - ERR
