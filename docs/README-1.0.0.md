# 云仓 · 技术文档（v1.0.0）

> 仓库：`cloud-warehouse`（Inventory System） · 基线版本：`1.0.0`
> 文档版本：v1.0.0（历史基线） · 最后更新：2026-10-12

[![version](https://img.shields.io/badge/version-1.0.0-lightgrey.svg)](./README-1.0.0.md)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-000.svg?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react)](https://react.dev)

---

## 1. 系统概述（v1.0.0）

云仓 v1.0.0 是库存管理系统的**首个正式上线版本**，采用 Next.js 14（App Router）+ React 18 + Prisma + MySQL 构建，提供商品、仓库、库存、出入库、调拨、盘点、BOM、序列号、条码打印、成本核算等 22 项业务模块的数字化管理能力。

> ⚠️ 本版本为**历史基线文档**。v1.0.0 已被 **v1.1.0** 取代，其缺陷已在 v1.1.0 中修复。当前生产环境运行的是 v1.1.0。请参阅 [v1.1.0 文档](./README-1.1.0.md) 与 [迭代记录](./CHANGELOG.md)。

---

## 2. 技术栈（v1.0.0）

| 组件 | 版本 |
|---|---|
| Next.js | 14.2.35 |
| React / React-DOM | 18 |
| TypeScript | 5.x |
| Ant Design | v5 |
| Prisma | 最新（ORM） |
| 数据库 | MySQL 8 |
| 鉴权 | NextAuth v4.24.11 |
| 部署 | 服务器 `/opt/inventory-system`，systemd `inventory.service`，nginx 反代 `:443 → :3000` |

---

## 3. 功能模块（v1.0.0，22 项）

| 模块 | 路径 | 说明 |
|---|---|---|
| 工作台 | `/` | 仪表盘概览 |
| 商品管理 | `/products` | 商品 / SKU / 分类 / 单位 |
| 购买申请 | `/purchase-requests` | 采购申请流转 |
| 扫码入库 | `/stock-in` | 入库 |
| 扫码出库 | `/stock-out` | 出库 / 审批 |
| 库存查询 | `/inventory` | 实时库存 / 货位 / 批次 |
| 盘点管理 | `/stocktake` | 盘点单（当时模型名 `StocktakeOrder`） |
| 调拨管理 | `/transfers` | 调拨单 |
| 仓库管理 | `/warehouse` | 仓库 / 区域 / 货位 |
| 货架地图 | `/shelf-map` | 货位可视化 |
| 供应商管理 | `/suppliers` | 供应商 |
| 客户管理 | `/customers` | 客户 |
| 预警中心 | `/alerts` | 库存预警 |
| 报表中心 | `/reports` | 统计报表 |
| BOM 管理 | `/bom` | 物料清单 |
| 序列号追踪 | `/serial` | 序列号 |
| 条码打印 | `/labels` | 标签 |
| 数据导出 | `/export` | CSV 导出（9 类） |
| 成本核算 | `/cost` | 成本 |
| 操作日志 | `/logs` | 操作留痕 |
| 系统设置 | `/settings` | 角色 / 权限 / 参数 |
| 数据备份 | —（无前端入口） | 见第 6 章缺陷 |

---

## 4. 核心机制（v1.0.0）

### 4.1 防篡改哈希链
对 `users / products / inventory / transactions / logs` 写入时追加链式 `prevHash`，由 `ChainState` 维护链头，保障审计不可篡改。

### 4.2 自动备份 + 在线回滚（后端）
- 每日 `backup.sh` 执行 `mysqldump` 压缩归档至 `/var/backups/inventory/`，保留 31 天。
- 回滚由服务器脚本 `restore.sh`（先打快照再恢复）或内部回滚 API（`localhost:3999`）完成。

### 4.3 鉴权
NextAuth Credentials + bcrypt 密码哈希；RBAC 角色权限模型。

---

## 5. 部署与运行（v1.0.0）

```bash
npm install
npx prisma generate
npm run build
npm run start   # 由 systemd inventory.service 拉起，监听 :3000
```

---

## 6. ❌ 已知缺陷（v1.0.0）

> 以下缺陷已在 **v1.1.0** 中修复或规避。此处如实记录 v1.0.0 的问题，供追溯与回归对照。

### 缺陷 1：数据导出部分模块不可用 ⚠️ 严重
数据导出页面对 **盘点记录 / 调拨记录 / 库存流水** 三类导出会直接报错，无法生成文件：

| 导出模块 | 报错现象 | 根因 |
|---|---|---|
| 盘点记录（STOCKTAKE） | 「服务器内部错误，请稍后重试」（HTTP 500） | 导出代码引用了**已重命名**的 Prisma 模型 `prisma.stocktakeOrder`，但数据模型早已改名为 `CountOrder`（`@map("count_orders")`）。客户端不存在 `stocktakeOrder` → 运行时 `undefined.findMany` → `TypeError` 崩溃。 |
| 调拨记录（TRANSFER） | 「请求参数格式错误」（HTTP 400） | 代码 `include: { fromWarehouse, toWarehouse }`，但 `TransferOrder` 模型在 v1.0.0 仅保留 `fromWhId / toWhId` 标量外键，**无这两个关系**，导致 `PrismaClientValidationError`。 |
| 库存流水（TRANSACTION） | 「请求参数格式错误」（HTTP 400） | 代码 `include: { product, warehouse }`，但 `InventoryTransaction` 模型仅保留 `productId / warehouseId` 外键，**无这两个关系**，同样触发校验错误。 |

**共因**：项目在 v1.0.0 前进行了数据模型重命名（盘点 `stocktake → count`）与关系扁平化（关系字段改为纯外键），但**数据导出模块未同步适配**；且 `next.config.js` 设置了 `ignoreBuildErrors: true`，编译期类型错误被屏蔽，问题直到**运行期**才暴露。

**影响范围**：仅上述 3 类受影响；其余 6 类（商品 / 库存 / 入库 / 出库 / 货位 / 仓库）可正常导出。

### 缺陷 2：备份 / 回滚无前端可视化入口 ⚠️ 体验
- 虽然底层已实现哈希链防篡改与每日自动备份，但 **v1.0.0 没有「数据备份」前端页面**。
- 管理员只能通过在服务器执行 `backup.sh` / `restore.sh` 脚本，或调用 **`localhost:3999` 的内部回滚 API**（纯 JSON，无界面）来完成备份 / 回滚，操作门槛高、需 SSH 权限。
- 旧的 `/admin-backup` 域名入口存在 **307 → /login 连环跳转**坏路由（`location /admin-backup/` 仅匹配带尾斜杠，无斜杠时落到 `location /` 被 Next 中间件拦截），旧书签 / 链接失效，用户无法从域名侧进入备份功能。

### 缺陷 3：技术栈陈旧 ⚠️ 维护性
- 基于 **Next.js 14.2.35 / React 18**，未使用 Next 15 的 App Router 异步 API 改进（动态 `params` / `headers()` 异步化）与 React 19 的并发特性、性能优化。
- antd v5 在 React 19 下存在兼容问题，后续升级需补丁（`@ant-design/v5-patch-for-react-19`）。

### 缺陷 4：编译期错误被屏蔽 ⚠️ 工程规范
- `next.config.js` 中 `ignoreBuildErrors: true` 与 lint 关闭，导致类型 / 模型不匹配等错误无法在构建阶段暴露（缺陷 1 即因此被掩盖到运行时）。

---

## 7. 缺陷修复对照（→ v1.1.0）

| 缺陷 | v1.0.0 状态 | v1.1.0 处理 |
|---|---|---|
| 缺陷 1 导出失败 | ❌ 3 类报错 | ✅ 改用 `countOrder` + 外键 Map 映射 |
| 缺陷 2 无前端备份 | ❌ 仅后端脚本 / 内部 API | ✅ 新增 `/settings/backup` 页面 + 桥接 API |
| 缺陷 2 旧 `/admin-backup` 坏路由 | ❌ 307 连环跳转 | ✅ 改为 301 重定向至 `/settings/backup` |
| 缺陷 3 技术栈陈旧 | ❌ Next14/React18 | ✅ 升级 Next15/React19 + antd 补丁 |
| 缺陷 4 编译错误屏蔽 | ⚠️ ignoreBuildErrors | 🔶 已记录，建议后续收紧 |

---

## 8. 相关文档
- [v1.1.0 最新文档](./README-1.1.0.md)
- [迭代记录 CHANGELOG](./CHANGELOG.md)
