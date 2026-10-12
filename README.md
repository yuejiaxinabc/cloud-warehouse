# ☁️ 云仓 · 智能仓储管理平台（v1.1.0）

> 英文代号 **YUNCANG Inventory Management** · 仓库 `cloud-warehouse` · 最后更新 2026-10-12

![Version](https://img.shields.io/badge/version-v1.1.0-blue)
![Next.js](https://img.shields.io/badge/Next.js-15.5-black)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748)
![License](https://img.shields.io/badge/license-MIT-green)
![Security](https://img.shields.io/badge/security-audited-orange)

> **云仓** 是一套面向中小仓库 / 商贸企业的**全栈库存管理系统**，提供从商品、仓库、货位、入库、出库、调拨、盘点到成本核算、序列号追踪、条码打印的全链路数字化能力，并内置**防篡改审计**与**自动备份 / 在线回滚**机制。

| 项目 | 说明 |
|---|---|
| 技术栈 | Next.js 15（App Router）· React 19 · TypeScript · Ant Design v5 |
| 数据层 | Prisma ORM · MySQL |
| 鉴权 | NextAuth v4（Credentials，RBAC 角色权限模型） |
| 部署 | 服务器 `/opt/inventory-system`，systemd `inventory.service`，nginx 反代 `:443 → :3000` |
| 运行环境 | Node.js ≥ 18（生产 v24）· MySQL 5.7+ / 8.0 |

---

## 🆕 v1.1.0 更新要点（2026-10-12）

| 类别 | 变更 |
|---|---|
| **技术栈升级** | Next.js `14.2.35 → 15.5.x`、React `18 → 19`、next-auth `→ 4.24.15`；引入 `@ant-design/v5-patch-for-react-19` 兼容 antd v5 |
| **Next 15 适配** | 动态路由 `params`、`headers()`/`cookies()` 改为异步 `await` |
| **前端备份回滚** | 新增 `/settings/backup` 页面：备份列表、哈希链完整性报告、立即备份、回滚到所选日期（二次确认 + 回滚前自动快照） |
| **导出修复** | 修复盘点记录（500）、调拨记录与库存流水（400）三类故障 |
| **路由清理** | 旧 `/admin-backup` 坏路由（307 连环跳转）改为 301 重定向至新备份页 |

---

## ✨ 功能模块（22 项）

| 模块 | 路径 | 说明 |
|---|---|---|
| 工作台 | `/` | 首页仪表盘，关键指标与预警概览 |
| 商品管理 | `/products` | 商品、SKU 变体、分类、单位、成本售价 |
| 购买申请 | `/purchase-requests` | 采购申请 → 审批 → 入库流转 |
| 扫码入库 | `/stock-in` | 扫码 / 批量入库 |
| 扫码出库 | `/stock-out` | 扫码 / 批量出库、审批 |
| 库存查询 | `/inventory` | 实时库存、货位分布、批次（Lot） |
| 盘点管理 | `/stocktake` | 盘点单（CountOrder）、盘点项、差异调整 |
| 调拨管理 | `/transfers` | 仓库间调拨（TransferOrder） |
| 仓库管理 | `/warehouse` | 仓库、区域（Zone）、货位（Location） |
| 货架地图 | `/shelf-map` | 货位可视化地图 |
| 供应商管理 | `/suppliers` | 供应商、采购价 |
| 客户管理 | `/customers` | 客户、领用部门 |
| 预警中心 | `/alerts` | 库存上下限预警规则与触发 |
| 报表中心 | `/reports` | 各类统计报表快照 |
| BOM 管理 | `/bom` | 物料清单、生产拆解 |
| 序列号追踪 | `/serial` | 序列号全生命周期追踪 |
| 条码打印 | `/labels` | 标签模板与打印任务 |
| 数据导出 | `/export` | 9 类数据 CSV 导出（带 BOM，Excel 友好） |
| 成本核算 | `/cost` | 成本快照与核算 |
| 操作日志 | `/logs` | 操作留痕 |
| 系统设置 | `/settings` | 角色、权限、系统参数、Token |
| **数据备份** | `/settings/backup` | **v1.1.0 新增**：前端备份 / 回滚 + 完整性报告 |

**扩展能力**：📱 [微信小程序端](https://github.com/yuejiaxinabc/cloud-warehouse-wxapp)（独立仓库）· 开放 API Token 接口

---

## 🔧 核心机制

### 防篡改哈希链（Hash Chain）
对 `users / products / inventory / transactions / logs` 等关键表写入时追加 `prevHash → 当前记录 hash` 的链式校验，并由 `ChainState` 维护链头。任何单条记录被事后篡改都会被链式校验发现，保障审计数据不可抵赖。

### 自动备份 + 在线回滚
- **自动备份**：每日 `backup.sh` 执行 `mysqldump --single-transaction` 压缩归档至 `/var/backups/inventory/`，保留 **31 天**。
- **完整性报告**：每次备份生成 `integrity_report.json`，供前端展示哈希链状态。
- **在线回滚**：回滚前自动对当前库打快照（`prerestore_<时间戳>.sql.gz`），再恢复所选日期备份，可安全回退。

### 鉴权与权限
- NextAuth Credentials 登录；密码使用 bcrypt（rounds 10–12）强哈希。
- RBAC：`UserRole / RolePermission / Permission` 三表联动，管理员（`requireAdmin`）才能访问备份 / 系统设置等高危接口。
- 备份 / 回滚接口采用 `execFile('bash', [脚本, 参数])` 参数化调用，杜绝命令注入。

---

## 🧰 技术栈

Next.js 15（App Router）· React 19 · TypeScript · Ant Design v5（+ `@ant-design/v5-patch-for-react-19`）· Tailwind CSS · Prisma ORM · MySQL 5.7+/8.0 · NextAuth.js · ioredis · Recharts · exceljs

---

## 🚀 快速开始

```bash
# 1) 安装依赖（Node.js ≥ 18）
#    注意：next-auth 与 React 19 存在 peer 冲突，需 --legacy-peer-deps
npm install --legacy-peer-deps

# 2) 配置环境变量
cp .env.example .env
# DATABASE_URL / NEXTAUTH_SECRET（openssl rand -base64 32 生成）/ NEXTAUTH_URL

# 3) 初始化数据库
npx prisma generate && npx prisma db push
npx ts-node prisma/seed.ts     # 播种演示数据与预置账号

# 4) 启动
npm run dev                    # http://localhost:3000
```

**预置账号**：`admin / Admin@123`（管理员）、`wh_manager / User@123`（仓库主管）等。
**首次上线请立即改密。**

### 生产部署

```bash
npm install --legacy-peer-deps
npx prisma generate
npm run build
npm run start   # 由 systemd inventory.service 拉起，监听 :3000
```

**关键环境变量**（生产 `.env`，不入库）：`DATABASE_URL`、`NEXTAUTH_URL`、`NEXTAUTH_SECRET`。

完整服务器部署（Ubuntu + MySQL + Nginx + HTTPS + systemd 托管）见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

---

## 🐛 缺陷与修复对照（v1.0.0 → v1.1.0）

| 缺陷 | v1.0.0 状态 | v1.1.0 处理 |
|---|---|---|
| 盘点记录导出失败（500） | ❌ 引用已重命名的 `stocktakeOrder` | ✅ 改用 `countOrder` |
| 调拨 / 库存流水导出失败（400） | ❌ include 了不存在的模型关系 | ✅ 改用外键 Map 映射 |
| 备份 / 回滚无前端入口 | ❌ 仅后端脚本 / 内部 API | ✅ 新增 `/settings/backup` 页面 + 桥接 API |
| 旧 `/admin-backup` 坏路由 | ❌ 307 连环跳转 | ✅ 改为 301 重定向至 `/settings/backup` |
| 技术栈陈旧 | ❌ Next14 / React18 | ✅ 升级 Next15 / React19 + antd 补丁 |
| 编译期错误被屏蔽 | ⚠️ `ignoreBuildErrors: true` | 🔶 已记录，建议后续收紧 |

详细缺陷分析见 [docs/README-1.0.0.md](docs/README-1.0.0.md) 第 6 章。

---

## ⚠️ 已知限制（v1.1.0）

- 导出其余 6 类（商品 / 库存 / 入库 / 出库 / 货位 / 仓库）长期可用，导出功能整体已修复。
- `next.config.js` 当前 `ignoreBuildErrors: true`（编译期类型错误被忽略），后续建议收紧以提前暴露 schema 漂移类问题。
- 1.1.0 代码改动截至文档日**尚未 git commit / push** 到主分支。

---

## 🔐 安全

- 本项目经过黑盒实测 + 代码审查 + 依赖扫描的安全审计，v1.0.1 已修复全部已发现的高危问题（详见 [docs/SECURITY.md](docs/SECURITY.md)）。
- 发现漏洞请**勿**公开 Issue，按 [docs/SECURITY.md](docs/SECURITY.md) 的披露政策私下报告。
- 核心数据安全机制：bcrypt(12) 密码哈希、Prisma 参数化查询、CSRF Origin 校验、接口限流、HTTPS/HSTS/CSP 安全头、库存乐观锁、**防篡改哈希链**。

---

## 📚 文档索引

| 文档 | 内容 |
|---|---|
| **[docs/README-1.1.0.md](docs/README-1.1.0.md)** | 版本快照 · v1.1.0 技术文档 |
| **[docs/README-1.0.0.md](docs/README-1.0.0.md)** | v1.0.0 基线文档（含 4 项已知缺陷与修复对照） |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 版本历史与迭代路线 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 从零部署上线（保姆级） |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发环境、架构与业务规则 |
| [docs/FIXLOG.md](docs/FIXLOG.md) | 问题修复跟踪 |
| [docs/SECURITY.md](docs/SECURITY.md) | 安全测试报告与漏洞披露 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 参与贡献指南 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 行为准则 |
| 📱 [cloud-warehouse-wxapp](https://github.com/yuejiaxinabc/cloud-warehouse-wxapp) | 微信小程序端（独立仓库） |

---

## 🤝 参与贡献

欢迎一切形式的贡献：报 Bug、提需求、改文档、修代码。新手入门建议从 [docs/FIXLOG.md](docs/FIXLOG.md) 里挑一条带修复方案的待办开始。流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📄 许可证

[MIT](LICENSE)
