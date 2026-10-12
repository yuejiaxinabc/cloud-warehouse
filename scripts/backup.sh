#!/usr/bin/env bash
#
# 桌面云仓 · 自动备份脚本
# 用法：bash backup.sh
# 从 /opt/inventory-system/.env 读取 DATABASE_URL（不落盘日志），生成按日期命名的压缩备份，
# 并清理超过 31 天的备份文件。
set -euo pipefail

DEPLOY_DIR="/opt/inventory-system"
BACKUP_DIR="/var/backups/inventory"
ENV_FILE="$DEPLOY_DIR/.env"
DATE=$(date +%F)
OUT="$BACKUP_DIR/warehouse_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

# 载入环境变量
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# 从 DATABASE_URL 解析连接信息（支持 mysql://user:pass@host:port/dbname[?...]）
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

echo "[$(date '+%F %T')] 开始备份 $DB_NAME -> $OUT"

DUMP_OPTS=(--single-transaction --no-tablespaces --routines --triggers --no-create-db --hex-blob --default-character-set=utf8mb4)
if [ -n "${DB_PASSWORD:-}" ]; then
  DUMP_OPTS+=(-p"$DB_PASSWORD")
fi

mysqldump "${DUMP_OPTS[@]}" -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" | gzip > "$OUT"

echo "[$(date '+%F %T')] 备份完成，大小 $(du -h "$OUT" | cut -f1)"

# 清理超过 31 天的备份（按文件修改时间）
find "$BACKUP_DIR" -maxdepth 1 -name 'warehouse_*.sql.gz' -mtime +31 -delete
echo "[$(date '+%F %T')] 已清理超过 31 天的备份"
