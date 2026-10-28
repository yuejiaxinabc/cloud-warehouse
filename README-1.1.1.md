# 云仓 v1.1.1 源码快照

- 版本：`1.1.1`（`package.json` 已对齐）
- 日期：2026-10-28
- 基线：v1.0.2（`63b106a`）之上的「可用性修复 + 视觉重构」版本
- 来源：与生产环境 http://82.156.236.221 当时运行的代码一致

## 这个版本包含什么

- 修掉「新建商品必然失败」（`handleApiError` 未导入 + 走废弃 boxes 表）
- 操作日志补齐（登录成功/失败、仓库、单位、分类、供应商）
- 新建商品抽屉关闭即重置表单
- 验证码错误提示精确化（`/api/auth/captcha/verify`，只校验不消费）
- 新 Logo（纯 SVG）+ 分组折叠侧边栏 + 全局设计系统 + 左右分栏登录页
- 商品/仓库表格在 1280px 下不再横向滚动
- seed 预置 10 个计量单位 + 6 个商品分类

## 不包含什么（这是 v1.2.0 才有的）

- 批次与效期台账（`/inventory/lots`）、批次冻结、临期预警
- 补货建议 → 购买申请闭环（`/api/replenishment`）

## 怎么跑起来

```bash
npm ci                 # 依赖（Node 18+，推荐 22）
cp .env.example .env   # 填 DATABASE_URL / NEXTAUTH_SECRET（≥32 位随机串）
npx prisma generate
npx prisma db push
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
npm run build && npm start
```

默认账号：`admin / Admin@123`（登录后请立即改密）。

## 备注

- `.git` 原始仓库历史完整保留，可直接 `git log` / `git diff` 对照上游。
- 本快照未包含 `node_modules`、`.next`、`.env`（安全考虑）。
