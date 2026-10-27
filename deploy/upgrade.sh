#!/usr/bin/env bash
# 云仓平台 —— 服务器端升级脚本（在 146.56.204.119 上以 root 执行）
#
# 用法：
#   bash upgrade.sh /root/cloud-warehouse-src.tar.gz
#
# 做的事：备份 → 换代码 → 装依赖 → 生成 Prisma → 构建 → 重启 → 健康检查
#        任何一步失败自动回滚到升级前的版本。
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/cloud-warehouse}"
SERVICE="${SERVICE:-cloud-warehouse}"
TARBALL="${1:-}"
TS=$(date +%Y%m%d-%H%M%S)
BK_DIR="/root/upgrade-backup-$TS"

log(){ echo -e "\n\033[1;36m==> $*\033[0m"; }
ok(){  echo -e "  \033[1;32m✓\033[0m $*"; }
warn(){ echo -e "  \033[1;33m!\033[0m $*"; }
die(){ echo -e "  \033[1;31m✗\033[0m $*"; exit 1; }

[[ $EUID -eq 0 ]] || die "需要 root"
[[ -n "$TARBALL" && -f "$TARBALL" ]] || die "用法: bash upgrade.sh <源码tar.gz>"
[[ -d "$APP_DIR" ]] || die "应用目录不存在: $APP_DIR"

ROLLBACK_NEEDED=0
rollback() {
  [[ $ROLLBACK_NEEDED -eq 1 ]] || return 0
  warn "正在回滚到 $BK_DIR ..."
  systemctl stop "$SERVICE" 2>/dev/null || true
  rm -rf "$APP_DIR"
  cp -a "$BK_DIR/app" "$APP_DIR"
  systemctl start "$SERVICE" 2>/dev/null || true
  sleep 3
  if curl -sf -o /dev/null "http://127.0.0.1:3000/login"; then
    warn "已回滚，服务可用。升级失败，请检查上面日志。"
  else
    die "回滚后服务仍不可用，需要人工介入！备份在 $BK_DIR"
  fi
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rollback; fi' EXIT

# ---------------------------------------------------------------- 0. 预检
log "0. 预检"
node -v | sed 's/^/  node /'
npm -v  | sed 's/^/  npm  /'
systemctl is-active --quiet "$SERVICE" && ok "服务当前运行中" || warn "服务当前未运行"
echo -n "  当前端口: "; ss -tlnp 2>/dev/null | grep -c ':3000' || true

# ---------------------------------------------------------------- 1. 备份
log "1. 备份"
mkdir -p "$BK_DIR"
systemctl stop "$SERVICE" || true
cp -a "$APP_DIR" "$BK_DIR/app"
cp -a "$APP_DIR/.env" "$BK_DIR/env.bak" 2>/dev/null || true
ok "代码已备份到 $BK_DIR/app"

if command -v mysqldump >/dev/null && [[ -f "$APP_DIR/.env" ]]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"')
  REST="${DB_URL#mysql://}"
  CREDS="${REST%%@*}"
  HOSTPART="${REST#*@}"
  DB_USER="${CREDS%%:*}"
  DB_PASS="${CREDS#*:}"
  DB_HOSTPORT="${HOSTPART%%/*}"
  DB_NAME="${HOSTPART#*/}"
  DB_HOST="${DB_HOSTPORT%%:*}"
  DB_PORT="${DB_HOSTPORT#*:}"
  [[ "$DB_PORT" == "$DB_HOSTPORT" ]] && DB_PORT=3306
  DB_NAME="${DB_NAME%%\?*}"
  # DATABASE_URL 里的口令是 URL 编码的（@ → %40、# → %23），要还原
  DB_PASS=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.unquote(sys.argv[1]))' "$DB_PASS")
  if mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BK_DIR/db.sql" 2>/dev/null; then
    ok "数据库已备份: $BK_DIR/db.sql ($(du -h "$BK_DIR/db.sql" | cut -f1))"
  else
    warn "数据库备份失败（不影响升级，但请留意）"
  fi
fi

# ---------------------------------------------------------------- 2. 校验 .env
log "2. 检查 .env（NEXTAUTH_SECRET 必须已轮换）"
ENV_FILE="$APP_DIR/.env"
[[ -f "$ENV_FILE" ]] || die "缺少 $ENV_FILE"

CUR_SECRET=$(grep -E '^NEXTAUTH_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
if [[ -z "$CUR_SECRET" || ${#CUR_SECRET} -lt 32 || "$CUR_SECRET" == *"inventory-system-secret-key"* ]]; then
  warn "检测到弱密钥/未设置，自动生成新的 NEXTAUTH_SECRET"
  NEW_SECRET=$(openssl rand -base64 48 | tr -d '\n')
  if grep -q '^NEXTAUTH_SECRET=' "$ENV_FILE"; then
    sed -i "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=\"$NEW_SECRET\"|" "$ENV_FILE"
  else
    echo "NEXTAUTH_SECRET=\"$NEW_SECRET\"" >> "$ENV_FILE"
  fi
  ok "已写入新密钥（长度 ${#NEW_SECRET}），所有现有会话将失效"
else
  ok "NEXTAUTH_SECRET 已合格（长度 ${#CUR_SECRET}）"
fi

NEXTAUTH_URL_VAL=$(grep -E '^NEXTAUTH_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
ok "NEXTAUTH_URL = $NEXTAUTH_URL_VAL"
case "$NEXTAUTH_URL_VAL" in
  https://*) ok "HTTPS 访问 → 会话 Cookie 将带 Secure 标志" ;;
  http://*)  warn "HTTP 访问 → Cookie 不带 Secure（能用，但建议尽快上 TLS）" ;;
  *) warn "NEXTAUTH_URL 格式异常，可能导致回调地址错误" ;;
esac

# ---------------------------------------------------------------- 3. 换代码
log "3. 解包新代码"
rm -rf "$APP_DIR".new && mkdir -p "$APP_DIR".new
tar -xzf "$TARBALL" -C "$APP_DIR".new --strip-components=1
cp -a "$BK_DIR/env.bak" "$APP_DIR".new/.env
[[ -d "$APP_DIR/public/uploads" ]] && { mkdir -p "$APP_DIR".new/public; cp -a "$APP_DIR/public/uploads" "$APP_DIR".new/public/; ok "已保留上传文件"; }
rm -rf "$APP_DIR"
mv "$APP_DIR".new "$APP_DIR"
ok "代码已更新到 $APP_DIR"

# ---------------------------------------------------------------- 4. 依赖与构建
log "4. 安装依赖并构建"
cd "$APP_DIR"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund 2>&1 | tail -3
else
  npm install --no-audit --no-fund 2>&1 | tail -3
fi
ok "依赖安装完成"

npx prisma generate 2>&1 | tail -2
ok "Prisma Client 已生成"

ROLLBACK_NEEDED=1   # 从这里开始，失败就回滚
npm run build 2>&1 | tail -15
[[ -f .next/BUILD_ID ]] || die "构建产物缺失"
ok "构建完成 (BUILD_ID=$(cat .next/BUILD_ID))"

# ---------------------------------------------------------------- 5. 启动
log "5. 启动服务"
systemctl restart "$SERVICE"
sleep 5

HEALTH_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:3000/login || echo 000)
  if [[ "$CODE" == "200" ]]; then HEALTH_OK=1; break; fi
  sleep 2
done

if [[ $HEALTH_OK -eq 1 ]]; then
  ok "服务健康检查通过 (HTTP 200)"
  ROLLBACK_NEEDED=0
else
  echo "  最后返回码: $CODE"
  journalctl -u "$SERVICE" -n 30 --no-pager | tail -20
  die "健康检查失败"
fi

# ---------------------------------------------------------------- 6. 安全自检
log "6. 部署后安全自检"
echo -n "  弱密钥拦截: "
curl -s -m 5 http://127.0.0.1:3000/login | head -c 60 | grep -q "服务暂不可用" && echo "⚠ 仍被拦（密钥不合格）" || echo "正常放行"
echo -n "  /login 安全头: "
curl -s -D - -o /dev/null -m 5 http://127.0.0.1:3000/login | grep -ciE 'x-frame-options|x-content-type-options|referrer-policy' | xargs -I{} echo "{} / 3"
echo -n "  未授权 API:    "
curl -s -o /dev/null -w '%{http_code}\n' -m 5 http://127.0.0.1:3000/api/users

trap - EXIT
echo
echo "=================================================="
echo " 升级完成"
echo " 备份目录: $BK_DIR"
echo " 查看日志: journalctl -u $SERVICE -f"
echo "=================================================="
