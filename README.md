# 云仓 · Cloud Warehouse

> 面向中小仓库 / 商贸企业的全栈库存管理系统（Inventory Management System）。

[![version](https://img.shields.io/badge/version-1.1.0-blue.svg)](./docs/README-1.1.0.md)
[![Next.js](https://img.shields.io/badge/Next.js-15.5-000.svg?logo=nextdotjs)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg)](https://prisma.io)

---

## 简介

**云仓** 提供从商品、仓库、货位、入库、出库、调拨、盘点到成本核算、序列号追踪、条码打印的全链路数字化能力，并内置**防篡改审计**与**自动备份 / 在线回滚**机制。

## 核心能力

- **22 项业务模块**：商品 / 采购申请 / 扫码出入库 / 库存查询 / 盘点 / 调拨 / 仓库货位 / 供应商客户 / 预警 / 报表 / BOM / 序列号 / 条码打印 / 数据导出 / 成本核算 / 操作日志 / 系统设置 / **数据备份**
- **防篡改哈希链**：关键表写入时追加链式 `prevHash`，由 `ChainState` 维护链头，保障审计不可抵赖
- **自动备份 + 在线回滚**：每日 `mysqldump` 归档（保留 31 天），前端可一键备份 / 回滚到所选日期，回滚前自动快照
- **RBAC 鉴权**：NextAuth Credentials + bcrypt，管理员方可访问备份 / 系统设置等高危接口

## 技术栈

| 组件 | 版本 |
|---|---|
| Next.js | 15.5（App Router） |
| React / React-DOM | 19 |
| TypeScript | 5.x |
| Ant Design | v5（+ `@ant-design/v5-patch-for-react-19`） |
| Prisma | ORM |
| 数据库 | MySQL 8 |
| 鉴权 | NextAuth v4 |

## 文档

- [📘 最新文档 · v1.1.0](./docs/README-1.1.0.md)
- [📗 基线文档 · v1.0.0（含已知缺陷）](./docs/README-1.0.0.md)
- [📙 迭代记录 CHANGELOG](./docs/CHANGELOG.md)

## 部署

```bash
npm install --legacy-peer-deps   # next-auth 与 React19 存在 peer 冲突
npx prisma generate
npm run build
npm run start                    # 由 systemd inventory.service 拉起，监听 :3000
```

> 更多部署、开发、安全细节见 `docs/` 下历史文档。生产环境变量（含 `DATABASE_URL` / `NEXTAUTH_*`）不入库，请于部署机 `/opt/inventory-system/.env` 维护。
