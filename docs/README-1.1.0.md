# 云仓 · 技术文档（v1.1.0）

> 仓库：`cloud-warehouse`（Inventory System） · 分支：`beta-test`
> 最后更新：2026-10-12 · 文档版本：v1.1.0

[![version](https://img.shields.io/badge/version-1.1.0-blue.svg)](./README-1.1.0.md)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000.svg?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg)](https://prisma.io)

---

## 1. 系统概述

**云仓** 是一套面向中小仓库 / 商贸企业的**全栈库存管理系统**，提供从商品、仓库、货位、入库、出库、调拨、盘点到成本核算、序列号追踪、条码打印的全链路数字化能力，并内置**防篡改审计**与**自动备份 / 在线回滚**机制。

| 项目 | 说明 |
|---|---|
| 技术栈 | Next.js 15（App Router）· React 19 · TypeScript · Ant Design v5 |
| 数据层 | Prisma ORM · MySQL |
| 鉴权 | NextAuth v4（Credentials，角色权限模型 RBAC） |
| 部署 | 服务器 `/opt/inventory-system`，systemd `inventory.service`，nginx 反代 `warehouse.yuejiaxin.ln.cn:443 → :3000` |
| 运行环境 | 服务器 Node.js v24 · MySQL 8 |

---

## 2. 功能模块（22 项菜单）

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

---

## 3. 核心机制

### 3.1 防篡改哈希链（Hash Chain）
对 `users / products / inventory / transactions / logs` 等关键表写入时追加 `prevHash → 当前记录 hash` 的链式校验，并由 `ChainState` 维护链头。任何单条记录被事后篡改都会被链式校验发现，保障审计数据不可抵赖。

### 3.2 自动备份 + 在线回滚
- **自动备份**：每日 `backup.sh` 执行 `mysqldump --single-transaction` 压缩归档至 `/var/backups/inventory/`，保留 **31 天**（`find -mtime +31 -delete`）。
- **完整性报告**：每次备份生成 `integrity_report.json`，供前端展示哈希链状态。
- **在线回滚**：回滚前自动对当前库打快照（`prerestore_<时间戳>.sql.gz`），再恢复所选日期备份，可安全回退。

### 3.3 鉴权与权限
- NextAuth Credentials 登录；密码使用 bcrypt（rounds 10–12）强哈希。
- RBAC：`UserRole / RolePermission / Permission` 三表联动，管理员（`requireAdmin`）才能访问备份 / 系统设置等高危接口。

---

## 4. v1.1.0 新增与变更

### 4.1 技术栈升级
| 组件 | v1.0.0 | v1.1.0 |
|---|---|---|
| Next.js | 14.2.35 | **15.5.x** |
| React | 18 | **19** |
| antd 适配 | 原生 v5 | 叠加 `@ant-design/v5-patch-for-react-19` |
| next-auth | v4.24.11 | v4.24.15（`--legacy-peer-deps` 安装） |

### 4.2 前端「数据备份」页面（用户自选）
- 新增 `src/app/(dashboard)/settings/backup/page.tsx`：antd 表格单选备份日期、哈希链完整性报告 Alert、**立即备份** 与 **回滚到所选备份**（Popconfirm 强确认）。
- 侧边栏新增「数据备份」入口（`SafetyOutlined`）。
- 两个带 `requireAdmin` 鉴权的桥接 API：
  - `GET/POST /api/admin/backup` —— 列出备份 + 触发备份
  - `POST /api/admin/backup/restore` —— 校验日期后回滚
- 均采用 `execFile('bash', [脚本, 参数])` 参数化调用，杜绝命令注入，并**绕开旧 nginx `/admin-backup` 坏路由**。

### 4.3 修复：数据导出失败（详见 v1.0.0 缺陷章节）
| 模块 | 修复前 | 修复后 |
|---|---|---|
| 盘点记录（STOCKTAKE） | 500 服务器内部错误 | 改用 `prisma.countOrder` ✅ |
| 调拨记录（TRANSFER） | 400 请求参数格式错误 | 去无效 `include`，改用外键 Map 映射 ✅ |
| 库存流水（TRANSACTION） | 400 请求参数格式错误 | 去无效 `include`，改用外键 Map 映射 ✅ |

### 4.4 部署与运维
- 服务器经 `npm install --legacy-peer-deps` → `prisma generate` → `npm run build`（97 路由全部通过）→ `systemctl restart inventory.service`。
- 旧 `/admin-backup` 域名入口已改为 **301 重定向**至 `/settings/backup`，彻底消除 307→/login 连环跳转。

---

## 5. 环境依赖与部署

```bash
# 依赖安装（next-auth 与 React19 存在 peer 冲突，需 legacy-peer-deps）
npm install --legacy-peer-deps
# 生成 Prisma 客户端
npx prisma generate
# 生产构建
npm run build
# 启动（systemd 单元已配置 -p 3000 -H 0.0.0.0）
npm run start
```

**关键环境变量**（生产 `.env`，不入库）：
- `DATABASE_URL` —— MySQL 连接串
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET` —— 鉴权
- 备份脚本读取 `/opt/inventory-system/.env` 中的 `DATABASE_URL`

---

## 6. 已知限制（v1.1.0）
- 导出功能已修复 3 类，其余 6 类（商品 / 库存 / 入库 / 出库 / 货位 / 仓库）长期可用。
- 1.1.0 代码改动截至文档日**尚未 git commit / push**到主分支，请以 `beta-test` 工作树为准。
- `next.config.js` 当前 `ignoreBuildErrors: true`（编译期类型错误被忽略），后续建议收紧以提前暴露 schema 漂移类问题。

---

## 7. 相关文档
- [迭代记录 CHANGELOG](./CHANGELOG.md)
- [v1.0.0 文档（含缺陷说明）](./README-1.0.0.md)
