# 部署记录（单机生产）

- 主机：146.56.204.119（Ubuntu 26.04 LTS，2C/3.6G/49G）
- 代码：/opt/cloud-warehouse（GitHub yuejiaxinabc/cloud-warehouse，commit 5670a1c）
- Node：/opt/node（v22.22.0），npm registry = registry.npmmirror.com
- 数据库：MySQL 8.4.11，库 warehouse，账号 inv_app@localhost
- 运行：systemd cloud-warehouse.service（next start 127.0.0.1:3000）
- 反代：nginx 80 -> 127.0.0.1:3000，日志 /var/log/cloud-warehouse.log
- 环境变量：/opt/cloud-warehouse/.env（权限 600）
- 演示账号：admin / Admin@123（其余 5 个账号 User@123）
- 手工建表：api_tokens（schema 未定义，源码用原生 SQL 访问）
- 种子脚本：/root/seed_server.js（原 prisma/seed.ts 与 schema 不同步）
- 常用命令：systemctl restart cloud-warehouse；journalctl -u cloud-warehouse -n 50
