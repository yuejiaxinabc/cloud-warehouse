# ☁️ 云仓 · 智能仓储管理平台

![Version](https://img.shields.io/badge/version-v1.0.1-blue) ![Next.js](https://img.shields.io/badge/Next.js-14.2-black) ![Prisma](https://img.shields.io/badge/Prisma-5-2D3748) ![License](https://img.shields.io/badge/license-MIT-green) ![Security](https://img.shields.io/badge/security-audited%20v1.0.1-orange)

> 面向中小型制造、零售与贸易企业的全链路库存管理系统。浏览器打开即用，从「货什么时候进来的」到「放在哪个货架哪个格子」，全程可追溯。

英文代号 **YUNCANG Inventory Management**。

---

## ✨ 功能总览

**核心 8 大模块**

| 模块 | 能力 |
|------|------|
| 📦 商品/物料管理 | SKU、分类体系、单位换算、规格属性、条码、供应商关联 |
| ⬇️ 入库管理 | 采购/退货/生产/其他入库、扫码入库、批次与效期 |
| ⬆️ 出库管理 | 销售/领料出库、审批流程、**乐观锁防超卖** |
| 🔍 库存查询 | 实时结存、可用量（on_hand − locked）、库位明细、批次追踪 |
| 📋 盘点管理 | 全盘/循环盘点、差异自动调整 |
| 🏭 仓库库位 | 多仓库、区域→货位→盒子三级库位、货架地图、移库调拨 |
| 🔔 预警中心 | 低库存 / 高库存 / 临期 / 呆滞，四类自动预警 |
| 📊 报表统计 | 收发存、周转率、库龄、移动加权 / FIFO 成本核算 |

**扩展能力**：BOM 物料清单 · 序列号追踪 · 条码标签打印 · Excel 导出（exceljs）· 微信小程序端（`wxapp/`）

**系统底座**：RBAC 用户角色权限 · 操作日志审计 · API Token 开放接口 · NextAuth 会话认证

## 🧰 技术栈

Next.js 14 (App Router) · TypeScript · Ant Design 5 · Tailwind CSS · Prisma ORM · MySQL 5.7+/8.0 · NextAuth.js · ioredis · Recharts · exceljs

## 🚀 快速开始

```bash
# 1) 安装依赖（Node.js ≥ 18）
npm install

# 2) 配置环境变量
cp .env.example .env
# DATABASE_URL / NEXTAUTH_SECRET（openssl rand -base64 32 生成）/ NEXTAUTH_URL

# 3) 初始化数据库
npx prisma generate && npx prisma db push
npx ts-node prisma/seed.ts     # 播种演示数据与预置账号

# 4) 启动
npm run dev                    # http://localhost:3000
```

**预置账号**：`admin / Admin@123`（管理员）、`wh_manager / User@123`（仓库主管）等，详见使用手册附录。**首次上线请立即改密。**

完整服务器部署（Ubuntu + MySQL + Nginx + HTTPS + systemd 托管）：见 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**。

## 📚 文档

| 文档 | 内容 |
|------|------|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 从零部署上线（保姆级） |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发环境、架构与业务规则 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本历史与迭代路线 |
| [docs/FIXLOG.md](docs/FIXLOG.md) | 问题修复跟踪 |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全测试报告与漏洞披露 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 参与贡献指南 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 行为准则 |

## 🔐 安全

- 本项目经过黑盒实测 + 代码审查 + 依赖扫描的安全审计，v1.0.1 已修复全部已发现的高危问题（详见 [docs/SECURITY.md](docs/SECURITY.md)）。
- 发现漏洞请**勿**公开 Issue，按 [docs/SECURITY.md](docs/SECURITY.md) 的披露政策私下报告。
- 核心数据安全机制：bcrypt(12) 密码哈希、Prisma 参数化查询、CSRF Origin 校验、接口限流、HTTPS/HSTS/CSP 安全头、库存乐观锁。

## 🤝 参与贡献

欢迎一切形式的贡献：报 Bug、提需求、改文档、修代码。新手入门建议从 [docs/FIXLOG.md](docs/FIXLOG.md) 里挑一条带修复方案的待办开始。流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可证

[MIT](LICENSE)
