#!/usr/bin/env bash
#
# 桌面云仓 · 数据库回滚脚本
# 用法：bash restore.sh            -> 列出可用备份
#       bash restore.sh YYYY-MM-DD -> 回滚到指定日期备份
# 回滚前先生成当前数据快照（prerestore_<时间戳>.sql.gz），可从快照再次回滚。
set -euo pipefail

DEPLOY_DIR="/opt/inventory-system"
BACKUP_DIR="/var/backups/inventory"
ENV_FILE="$DEPLOY_DIR/.env"

# 载入环境变量（同 backup.sh）
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

decode_uri() {
  local s="$1"
  s="${s//+/ }"
  printf '%b' "${s//%/\\x}"
}

URL="${DATABASE_URL:-}"
if [ -n "$URL" ]; then
  DB_USER=$(printf '%s' "$URL"    | sed -E 's#mysql://([^:]+):.*#\1#')
  DB_PASSWORD=$(printf '%s' "$URL" | sed -E 's#mysql://[^:]+:([^@]*)@.*#\1#')
  DB_HOST=$(printf '%s' "$URL"    | sed -E 's#mysql://[^@]*@([^:/]+).*#\1#')
  DB_PORT=$(printf '%s' "$URL"    | sed -E 's#mysql://[^@]*@[^:/]*:([0-9]+)/.*#\1#')
  DB_NAME=$(printf '%s' "$URL"    | sed -E 's#.*/([^?]+).*#\1#')
  DB_PASSWORD=$(decode_uri "$DB_PASSWORD")
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-inventory}"

# 无参数：列出可用备份
if [ "$#" -lt 1 ]; then
  echo "可用备份（输入日期回滚）："
  ls -1 "$BACKUP_DIR"/warehouse_*.sql.gz 2>/dev/null | sed 's#.*warehouse_##; s#.sql.gz##' || echo "（无可用备份）"
  exit 0
fi

DATE="$1"
BACKUP_FILE="$BACKUP_DIR/warehouse_${DATE}.sql.gz"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "错误：备份文件不存在 $BACKUP_FILE"
  exit 1
fi

TS=$(date +%Y%m%d_%H%M%S)
SNAPSHOT="$BACKUP_DIR/prerestore_${TS}.sql.gz"

echo "[$(date '+%F %T')] 回滚前生成当前数据快照：$SNAPSHOT"
MY_OPTS=(--single-transaction --no-tablespaces)
if [ -n "${DB_PASSWORD:-}" ]; then
  MY_OPTS+=(-p"$DB_PASSWORD")
fi
mysqldump "${MY_OPTS[@]}" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" | gzip > "$SNAPSHOT"

echo "[$(date '+%F %T')] 开始从 $BACKUP_FILE 恢复数据库 $DB_NAME ..."
if [ -n "${DB_PASSWORD:-}" ]; then
  gunzip -c "$BACKUP_FILE" | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
else
  gunzip -c "$BACKUP_FILE" | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
fi
echo "[$(date '+%F %T')] 恢复完成。"
