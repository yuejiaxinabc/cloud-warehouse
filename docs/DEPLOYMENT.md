# 部署文档（DEPLOYMENT.md）

> 目标：一台全新 Ubuntu 服务器 → 可通过 HTTPS 域名访问的云仓系统。每一步都能复制粘贴执行。
> 实测环境：Ubuntu 24.04 · 腾讯云 2核4G · Node 20/24 · MySQL 8.0 · Nginx · Let's Encrypt。
> 逐步截图版请看《云仓使用手册》部署篇（仓库 Release 附带的 PDF）。

---

## 1. 准备清单

| 项目 | 要求 | 说明 |
|------|------|------|
| 服务器 | Ubuntu 20.04+（推荐 24.04），2核4G 起，40G+ 磁盘 | 阿里云 / 腾讯云 / 物理机均可 |
| 域名 | 一个已备案域名（下文以 `warehouse.example.com` 代指） | A 记录解析到服务器 IP |
| 软件 | Node.js ≥ 18、MySQL ≥ 5.7（推荐 8.0）、Nginx、Git | 第 2 节安装 |
| 代码 | 本仓库 | git clone 或上传 |

## 2. 安装基础软件

```bash
sudo apt update

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# MySQL + Nginx + Git
sudo apt install -y mysql-server nginx git

node -v && npm -v && mysql --version && nginx -v   # 验证
```

## 3. 创建数据库与账号

```bash
sudo mysql
```

```sql
CREATE DATABASE warehouse CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'warehouse'@'localhost' IDENTIFIED BY '你的强密码';
GRANT ALL PRIVILEGES ON warehouse.* TO 'warehouse'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> ⚠️ 密码含 `@ : / #` 等字符时，写入 `.env` 必须 URL 转义（如 `@` → `%40`）。

## 4. 上传代码并安装依赖

```bash
cd /opt
sudo git clone <你的仓库地址> inventory-system    # 或 scp 上传
cd /opt/inventory-system
sudo npm install --registry=https://registry.npmmirror.com
```

## 5. 配置环境变量

```bash
sudo cp .env.example .env
openssl rand -base64 32        # 生成 NEXTAUTH_SECRET，复制输出
```

编辑 `.env`：

| 变量 | 填什么 | 示例 |
|------|--------|------|
| `DATABASE_URL` | 连接串（密码已转义） | `mysql://warehouse:%402026@localhost:3306/warehouse` |
| `NEXTAUTH_SECRET` | 上一步的随机串 | `kj3n...==` |
| `NEXTAUTH_URL` | 最终访问地址 | `https://warehouse.example.com` |

> 🔴 安全红线：`.env` 含数据库密码与会话密钥，已被 `.gitignore` 排除，**绝不能提交到 Git**。

## 6. 初始化数据库并构建

```bash
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts     # 预置账号 + 演示数据
npm run build
```

> 2核4G 构建约 2–5 分钟。内存不足被杀时先加 swap：
> `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`

## 7. systemd 托管（开机自启 + 崩溃自拉起）

创建 `/etc/systemd/system/inventory.service`：

```ini
[Unit]
Description=Inventory Management System
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/inventory-system
ExecStart=/usr/bin/node /opt/inventory-system/node_modules/.bin/next start -p 3000 -H 0.0.0.0
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=NEXTAUTH_URL=https://warehouse.example.com
EnvironmentFile=/opt/inventory-system/.env

[Install]
WantedBy=multi-user.target

# --- 建议同时加上安全加固（生产实例同款）---
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=full
ProtectHome=read-only
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now inventory.service
sudo systemctl status inventory.service    # active (running) 即成功
curl -I http://127.0.0.1:3000              # 307 → /login 即正常
```

## 8. Nginx 反向代理 + HTTPS

创建 `/etc/nginx/sites-available/warehouse`：

```nginx
server {
    server_name warehouse.example.com;
    client_max_body_size 20m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location /uploads/ {
        alias /opt/inventory-system/public/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    listen 80;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/warehouse /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 免费 HTTPS 证书（自动续期）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d warehouse.example.com
```

## 9. 防火墙

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> 🔴 云服务商**安全组**同样只放行 22/80/443；**绝不要**放行 3000（应用）与 3306（MySQL），它们只应监听本机回环。

## 10. 上线验证清单

| 检查项 | 方法 | 预期 |
|--------|------|------|
| 服务运行 | `systemctl status inventory` | active (running) |
| 本地端口 | `curl -I http://127.0.0.1:3000` | 307 → /login |
| 域名访问 | 浏览器打开 `https://…` | 登录页正常 |
| HTTP 跳转 | `curl -I http://…` | 301 到 https |
| 外部 3000 封闭 | 外网 `curl http://IP:3000` | 连接超时 |
| 登录 | admin 登录 | 进入工作台 |

## 11. 常见部署问题

| 现象 | 解决 |
|------|------|
| `npm install` 卡住 | 换国内源 `--registry=https://registry.npmmirror.com` |
| `prisma db push` 连接失败 | MySQL 未启动 / 账密错误 / 密码未转义 |
| 访问 502 | 应用没起来：`journalctl -u inventory -n 50`；确认 3000 在监听 |
| 构建被 Killed | 加 swap（见第 6 节） |
| 登录后跳回登录页 | `NEXTAUTH_URL` 与实际域名不一致 / `NEXTAUTH_SECRET` 未设置 |
| 验证码不显示 | 浏览器禁用了 JS，换标准浏览器 |

## 12. 部署后必做

1. **立即修改全部预置账号密码**（admin 等 6 个 seed 账号）
2. 配置每日数据库备份（见使用手册运维篇：`mysqldump` + crontab）
3. 核对 [docs/SECURITY.md](SECURITY.md) 的安全基线清单
4. 系统设置中维护企业名称、客服电话等品牌信息
