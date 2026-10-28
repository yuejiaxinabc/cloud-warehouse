# ☁️ 云仓 · 智能仓储管理平台

![Version](https://img.shields.io/badge/version-v1.2.0-blue) ![Next.js](https://img.shields.io/badge/Next.js-14.2-black) ![Prisma](https://img.shields.io/badge/Prisma-5-2D3748) ![License](https://img.shields.io/badge/license-MIT-green) ![Security](https://img.shields.io/badge/security-2FA%20%7C%20audit-orange)

> 面向中小型制造、零售与贸易企业的全链路库存管理系统。浏览器打开即用，从「货什么时候进来的、哪个批次、什么时候到期」到「放在哪个货架哪个格子」，全程可追溯。

英文代号 **YUNCANG Inventory Management**。

---

## ✨ 功能总览（v1.2.0）

**核心业务**

| 模块 | 能力 |
|------|------|
| 📦 商品与主数据 | SKU、条码、单位、分类、供应商、客户、BOM；**保质期（天）** 决定效期策略 |
| ⬇️ 入库管理 | 扫码入库、采购/退货/生产/其他入库；**效期商品强制批次号 + 生产日期**，到期日自动推算 |
| ⬆️ 出库管理 | 扫码出库、领用登记、审批与过账；**FEFO 先到期先出**，批次拣货明细可追溯 |
| 🏭 仓库与货位 | 多仓库；建仓自动生成 A–Z 26 货架 × 100 货位；**四段货位编码**；货架地图可视化 |
| 🔍 库存查询 | 实时结存、可用量（在手 − 锁定）、批次/货位明细 |
| 📋 盘点 / 调拨 | 全盘与循环盘点、差异调整；跨仓调拨（发出 → 接收） |
| 🔔 预警与补货 | 缺货 / 低库存 / 高库存价值 / 批次临期；**补货建议一键转购买申请** |
| 📊 报表与分析 | 收发存、周转、库龄、成本；账实对账 / 呆滞 / ABC / 补货建议 |
| 🧾 批次与效期 | 批次台账、剩余天数、临期预警、**批次冻结**（盘点/质检/争议） |
| 📎 单据附件 | 入库挂发票与送货单、出库挂签收回单（图片 / PDF） |
| 🗓️ 数据快照 | 每日 00:05 库存日结快照，支持任意时点回溯 |
| 📺 现场大屏 | 独立页面 /screen，白底大字、30 秒刷新、悬停看数 |
| 🧹 回收站 | 主数据软删除，15 天可恢复 |

**系统与安全**

RBAC 用户/角色/权限 · 操作日志审计 · **两步验证（TOTP）** · 登录限速与递增延迟 · 验证码服务端一次性校验 · **API Token + 开放 API** · **Webhook 订阅（HMAC 签名）** · **SMTP 邮件与报表订阅** · 初始化向导

**扩展**：BOM 物料清单 · 序列号追踪 · 条码标签打印 · Excel 导入导出（exceljs）· 📱 [微信小程序端](https://github.com/yuejiaxinabc/cloud-warehouse-wxapp)（独立仓库）

## 🧰 技术栈

Next.js 14 (App Router) · TypeScript · Ant Design 5 · Tailwind CSS · Prisma 5 · MySQL 8 · NextAuth.js · ioredis · Recharts · exceljs · nodemailer

## 🚀 快速开始

```bash
# 1) 安装依赖（Node.js ≥ 18，推荐 22）
npm ci

# 2) 环境变量
cp .env.example .env
#   DATABASE_URL      mysql://user:pass@localhost:3306/warehouse
#   NEXTAUTH_SECRET   openssl rand -base64 48
#   NEXTAUTH_URL      http://你的地址

# 3) 初始化数据库（52+ 张表）与基础数据
npx prisma generate && npx prisma db push
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts

# 4) 构建与启动
npm run build && npm start
```

**预置账号**：`admin / Admin@123`（管理员）、`wh_manager` / `wh_keeper` / `buyer` / `sales` / `auditor`（密码 `User@123`）。**首次上线请立即改密。**

生产部署（Ubuntu + MySQL + Nginx + systemd + 备份/快照/报表三个 cron）：见 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**。

## 📚 文档

| 文档 | 内容 |
|------|------|
| **[docs/云仓用户手册-v1.2.0.pdf](docs/云仓用户手册-v1.2.0.pdf)** | **用户手册（PDF，27 页）**：全模块操作、字段说明、FAQ |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本历史：v1.2.0 分五批落地全部需求 |
| [docs/ROADMAP-v1.2.md](docs/ROADMAP-v1.2.md) | 需求评审：12 条需求的逐条核对、优先级与工作量 |
| [docs/UPDATE-2026-10-28.md](docs/UPDATE-2026-10-28.md) | v1.1.1 修复说明（新建商品 P0、日志、表单、验证码） |
| [docs/UPDATE-2026-10-27.md](docs/UPDATE-2026-10-27.md) | v1.0.2 更新说明（安全复检、货位闭环） |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 从零部署上线 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发环境、架构与业务规则 |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全基线（限速、CSRF、上传、密钥体检） |
| [docs/FIXLOG.md](docs/FIXLOG.md) | 历史缺陷与修复记录 |

## 🔌 开放接口

```bash
# 只读接口，Token 在「系统设置 → API Token」生成
curl -H "Authorization: Bearer <TOKEN>" "http://<host>/api/v1/open/products?pageSize=100"
curl -H "Authorization: Bearer <TOKEN>" "http://<host>/api/v1/open/inventory?warehouseId=1"
curl -H "Authorization: Bearer <TOKEN>" "http://<host>/api/v1/open/movements?since=2026-10-01T00:00:00Z"
```

Webhook 事件：`product.created` / `product.updated` / `inbound.posted` / `outbound.posted` / `stock.changed`，签名头 `x-yc-signature`（HMAC-SHA256）。

## 📄 License

MIT
