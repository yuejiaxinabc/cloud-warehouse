# v1.2 需求评审与路线（ROADMAP）

> 输入：客户选型反馈 12 条（批次效期 / 补货 / 冻结 / 开放 API / 附件 / 登录安全 / 日结 / 回收站 / 报表订阅 / 初始化向导 / 数据大屏 / 宽表体验）
> 结论：**4 条本轮已落地**，1 条已在 v1.1.1 顺带解决，剩下按「硬门槛 → 审计 → 体验」排序推进。
> 核对方式：逐条对照当前代码与数据库（`prisma/schema.prisma` + `src/app/api/*`），不凭印象。

---

## 一、逐条核对

| # | 需求 | 现状核对 | 本轮结论 |
|---|---|---|---|
| 1 | 批次/效期一等公民 | `inventory_lots` **已有** `lotNumber / producedAt / expiredAt / status`；`products` 已有 `shelfLifeDays`。缺的是录入强制、批次台账、临期预警、FEFO 选批 | **部分落地**：台账 + 临期预警 + 冻结已做；入库强制批次、出库 FEFO 待做 |
| 2 | 自动补货建议 → 购买申请 | 预警是实时计算的（不落表）；`purchase_requests` 模块完整但两者没连起来 | **已落地**：`/api/replenishment` + 一键转购买申请 |
| 3 | 库存冻结 | `inventory.locked` 字段在，缺少操作入口；`inventory_lots.status=2` 语义已预留 | **已落地**（批次级冻结/解冻，同步 locked） |
| 4 | 开放 API + Webhook | 已有 `/api/v1/mp/*`（小程序）+ API Token（`/api/settings/token`、`api-token.ts` 已做 `timingSafeEqual`）；对外 REST 契约、Webhook、签名、限流未做 | **未做**（大工程） |
| 5 | 单据附件 | 无附件表；`/api/upload` 已能安全存图（魔数嗅探 + 随机名） | **未做**（中） |
| 6 | 登录安全增强 | 已有 IP+账号双维度限速、失败审计落库、验证码服务端一次性消费 | **部分**：递增延迟 / 2FA 未做 |
| 7 | 库存日结快照 | 有 `report_snapshots` / `cost_snapshots` 表，没有日结任务；报表只有 7 天趋势 | **未做**（中） |
| 8 | 回收站 / 撤销 | 删除均为硬删除（仓库/供应商/商品） | **未做**（中，需软删除字段 + 迁移） |
| 9 | 报表订阅 | 无邮件通道配置 | **未做**（中） |
| 10 | 初始化向导 | v1.1.1 已预置 10 个计量单位 + 6 个商品分类；建仓自动生成 26×100 货位 | **基本满足**，只差「首次登录引导页」 |
| 11 | 数据大屏 | 无 | **未做**（小，独立路由，风险低） |
| 12 | 宽表格横向滚动 | v1.1.1 已修（商品表合并列、仓库表收窄，1280px 下 scrollWidth = clientWidth） | **已解决** |

---

## 二、本轮落地细节

### 1) 批次台账 `/inventory/lots`
- API：`GET /api/inventory/lots?warehouseId&keyword&expiringDays&page`
- 字段：批次号、商品、仓库、数量、生产日期、到期日期、**剩余天数**（负数=已过期）、状态（可用/临期/已过期/已冻结）
- 无需 schema 迁移。

### 2) 临期自动预警
- `GET /api/alerts?type=expiry`：扫 `inventory_lots`，已过期 → 紧急，≤7 天 → 紧急，≤30 天 → 警告，冻结批次不计入。
- 预警中心筛选新增「批次临期」。

### 3) 库存冻结
- `POST /api/inventory/lots/{id}/status`，`action=freeze|unfreeze`
- 冻结：`lot.status=2` + `inventory.locked += 批次数量`（夹在 `[0, onHand]`）；解冻反向释放；写 `operation_logs`（module=inventory）。
- 出库/下单读的是 `locked`，因此冻结后可用量立刻下降，达到「防误占用」目的。

### 4) 补货建议 → 购买申请
- `GET /api/replenishment`：`缺口 = 安全库存 − 可用量`；`建议量 = ceil(缺口)`；设了上限则不超过 `上限 − 可用量`。
- `POST /api/replenishment/to-purchase-request`：按选择批量建单，单号 `PR-YYYYMMDD-###`，同名同仓已有 PENDING 自动跳过。
- 「预警 → 补货 → 入库」闭环已通：申请单在 `/purchase-requests` 可继续走「一键入库」。

---

## 二·五、v1.3.0 已补上的四项（2026-10-28）

| 需求 | 落地情况 |
|---|---|
| 单据附件 | `attachments` 表 + `/api/attachments` + 入库/出库详情页「单据附件」卡片 |
| 库存日结快照 | `inventory_snapshots` 表 + `POST /api/snapshots/run`（幂等）+ `GET /api/snapshots?date=` + cron 00:05 |
| 数据大屏 | `/screen` 深色看板（KPI / 7 天柱图 / 预警滚动 / 时钟），30s 轮询只读 |
| 初始化向导 | `/setup` 四步自检 + 完成度进度 + 模板说明 |

## 三、下一步优先级（建议 v1.4）

| 优先级 | 事项 | 工作量 | 依赖 / 风险 |
|---|---|---|---|
| ✅ 已做 | 单据附件 | — | v1.3.0 |
| ✅ 已做 | 库存日结快照（还差「报表页按时点查询」的 UI） | 0.5 天 | 数据层已完成 |
| ✅ 已做 | 入库强制录入批次 / 生产日期（有 `shelfLifeDays` 的商品） | — | v1.2.0 |
| ✅ 已做 | 出库 FEFO 选批策略（含批次拣货明细与流水备注） | — | v1.2.0 |
| ✅ 已做 | 软删除 + 15 天回收站 | — | v1.2.0 |
| ✅ 已做 | 2FA + 递增延迟 | — | v1.2.0 |
| ✅ 已做 | 报表订阅（SMTP 配置 + 日报/周报） | — | v1.2.0 |
| ✅ 已做 | 开放 API（只读三接口）+ Webhook 订阅 | — | v1.2.0 |
| **P1** | Webhook 重试队列 / 事件审计（现在失败只记 last_status） | 1 天 | 可加 `webhook_deliveries` 表 |
| ✅ 已做 | 报表订阅（SMTP + 日报/周报 cron） | — | v1.2.0 |
| **P2** | 报表订阅（日报/周报邮件） | 3 天 | SMTP 配置 + 模板 + 定时；失败重试 |
| **P2** | 数据大屏（电视全屏） | 1 天 | 独立路由 `/screen`，轮询 30s，无写操作 |
| **P3** | 首次登录引导向导 | 1 天 | 检测缺单位/仓库/商品 → 引导；可复用 `/products/import` 模板 |

---

## 四、本轮的验收清单

```
GET  /api/inventory/lots               → 批次列表（含剩余天数 / 冻结状态）
POST /api/inventory/lots/{id}/status   → 冻结后 inventory.locked 增加，解冻回落
GET  /api/alerts?type=expiry           → 30 天内到期的批次出现在预警列表
GET  /api/replenishment                → 仅返回「可用量 < 安全库存」的商品/仓库组合
POST /api/replenishment/to-purchase-request → purchase_requests 新增 PENDING 单
```
