# 修复文档（FIXLOG.md）

> 本文档记录系统的已知问题、修复方案与修复进度。每条记录包含：问题编号、严重程度、影响范围、根因、修复方案、状态。
> 新增条目请按 `FIX-YYYY-####` 递增编号，从上往下按时间倒序排列。

---

## FIX-2026-1025 · `Role` 表被清空导致全员无法登录（P0，已修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-27 |
| 严重程度 | 🔴 P0（线上实测复现） |
| 影响范围 | 全部账号登录；表现为「输对密码也进不去」 |
| 根因 | 数据库 `Role` 表 **0 行**，而 `user_roles` 仍有 6 条指向 `role_id` 1–6（外键存在、数据被清空）。`authorize()` 里 `prisma.user.findFirst({ include: { userRoles: { include: { role: true } } } })` 命中 null → 抛 `Inconsistent query result: Field role is required to return data, got null instead`，且错误原文回显到 `/api/auth/error` |
| 实测证据 | 解出验证码后登录 `admin/Admin@123` → `Invalid prisma.user.findFirst() invocation: Inconsistent query result: Field role is required to return data, got null instead.`；`SELECT COUNT(*) FROM Role` = 0 |
| 修复方案 | ① 补回 6 个角色（admin/wh_manager/wh_keeper/buyer/sales/auditor），id 与 `user_roles`、`role_permissions` 对齐；② `prisma/seed.ts` 由 `create` 改 `upsert`，避免重复执行时唯一键冲突中断导致角色缺失；③ `authorize()` 对 `userRoles`/`role` 判空，不再把 ORM 原始异常抛给客户端 |
| 状态 | ☑ 已修复（2026-10-27 补数据 + 复测登录成功） |

```sql
INSERT INTO `Role` (id, name, code, status, created_at, updated_at) VALUES
(1,'系统管理员','admin',1,NOW(3),NOW(3)),
(2,'仓库主管','wh_manager',1,NOW(3),NOW(3)),
(3,'仓管员','wh_keeper',1,NOW(3),NOW(3)),
(4,'采购员','buyer',1,NOW(3),NOW(3)),
(5,'销售员','sales',1,NOW(3),NOW(3)),
(6,'审计员','auditor',1,NOW(3),NOW(3));
```

---

## FIX-2026-1012 · 安全复检九项（P0~P2，已修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-27 |
| 严重程度 | 🔴 P0 ×2 / 🟠 P1 ×4 / 🟡 P2 ×3 |
| 影响范围 | 登录、上传、CSRF、API Token、会话、限速 |

| 子项 | 问题 | 位置 | 状态 |
|---|---|---|---|
| a | 验证码存储写在 route 内，`authorize()` 访问不到 → 直接 POST callback 可完全绕过 | 新增 `src/lib/captcha-store.ts`；`src/lib/auth.ts:52` | ☑ 已修复 |
| b | 验证码 SVG 用 `<text>` 节点，答案明文躺在响应里（正则即可提取） | 新增 `src/lib/captcha-font.ts`（5×7 点阵 `<path>`） | ☑ 已修复 |
| c | 上传按客户端 `Content-Type` + 后缀判断 → 可上传 `.html` → 存储型 XSS → 账号接管 | `src/app/api/upload/route.ts:23`（魔数嗅探 + 白名单 + crypto 随机名 + 拒绝 SVG） | ☑ 已修复 |
| d | CSRF 同源基准取 `X-Forwarded-Host`（客户端可伪造），同时伪造 Origin 与 XFH 即绕过 | `src/middleware.ts:157-186`（改用请求真实 `Host`） | ☑ 已修复 |
| e | 登录错误文案区分「用户名不存在/密码错误还剩 N 次」→ 用户名枚举；且 `bcrypt.compare` 仅在用户存在时执行，响应时间差也是通道 | `src/lib/auth.ts:103`（统一文案 + dummy bcrypt） | ☑ 已修复 |
| f | 失败计数只按 username → 对 admin 打 5 次即可锁死 30 分钟（无需凭据的 DoS） | `src/lib/auth.ts:22-27`（IP+账号双维度、Redis 计数、指数退避不硬锁） | ☑ 已修复 |
| g | API Token 用 `Math.random()`（可预测）+ 未配置即放行（fail-open） | `src/lib/api-token.ts`（`crypto.randomBytes` + fail-closed + `timingSafeEqual`） | ☑ 已修复 |
| h | `NEXTAUTH_SECRET` 曾随 `..env.vNsxxG4DI5` 提交进公开仓库 | 新增 `src/lib/env-guard.ts` + `src/instrumentation.ts`；`middleware.ts:118` 弱密钥全站 503 | ☑ 代码已加闸门；**密钥轮换与 git 历史清理仍需人工执行** |
| i | 会话 Cookie 未显式声明安全属性；`hasRole()` 大小写不一致；ioredis 未监听 `error` 会打挂进程 | `src/lib/auth.ts:152-168,205`；`src/lib/redis.ts` | ☑ 已修复 |

**复测（线上）**：

```
不带验证码直接打 callback   → error=验证码参数错误
伪造 captchaToken           → error=验证码已过期，请刷新
有效票据 + 错误答案         → error=验证码错误，票据销毁
同一票据重放                → error=验证码已过期，请刷新
不存在用户 vs 存在用户      → 文案完全一致
upload 上传 .html（伪造 image/png） → 只支持 JPG / PNG / GIF / WEBP 图片
```

---

## FIX-2026-1013 · 入库不落货位导致货架地图空白（P0，已修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-27 |
| 严重程度 | 🔴 P0（业务断链） |
| 影响范围 | 入库后的商品在货架地图上完全不可见；`/shelf-map`、`/inventory` 数据互相对不上 |
| 根因 | `stock-in.service` 只写 `inventory`，既不写 `inventory.locationId` 也不写 `location_stocks`；而货架地图只读 `location_stocks` → 「库存有 6 条、货架一片空白」 |
| 修复方案 | ① `schema.prisma:614` 增 `InboundItem.locationId`；② 新增 `src/lib/location-binding.ts`（四段编码 `区-排-列-位`、三段旧码自动补齐、`syncLocationStock()`、`assertLocationInWarehouse()`）；③ `src/services/stock-in.service.ts:229-281` 过账强制校验货位并双写；④ `src/app/api/shelf-map/route.ts:82-113` 对历史数据按 `inventory.location_id` 兜底 |
| 状态 | ☑ 已修复 |

---

## FIX-2026-1015 · 数据导出 500 / 400（P0，已修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-27 |
| 严重程度 | 🔴 P0 |
| 影响范围 | 盘点记录导出、调拨记录导出、库存流水导出 |
| 根因 | ① `prisma.stocktakeOrder` 模型不存在（schema 里叫 `CountOrder`）→ 调用即 `TypeError` → 500；② `TransferOrder` 无 `fromWarehouse/toWarehouse` 关系、无 `totalQty` 字段；③ `InventoryTransaction` 无 `product/warehouse` 关系、时间字段是 `txnTime` 而非 `createdAt` |
| 修复方案 | `src/app/api/export/route.ts:154-289` 全部改为按外键查 Map 映射 / 明细聚合，不再依赖不存在的关系 |
| 状态 | ☑ 已修复（实测三类导出均 200） |

---

## FIX-2026-1014 / 1016~1023 · 货位与体验批量修复（P1~P3，已修复）

| 编号 | 内容 | 位置 |
|------|------|------|
| FIX-2026-1014 | 新建仓库统一建 A–Z 26 个货架、每架 100 个货位（原 A–M 且编码不补零） | 新增 `src/lib/shelf-init.ts`；`api/warehouse/route.ts:74` |
| FIX-2026-1016 | 新增库存分析四类（对账/呆滞/ABC/补货）；扫码点击即拉起摄像头 | 新增 `api/inventory/analysis/route.ts`、`(dashboard)/inventory/analysis/page.tsx` |
| FIX-2026-1017 | 货位编码不再追加 `-1/-2` 序号（四段变五段） | `(dashboard)/shelf-map/page.tsx:162` |
| FIX-2026-1018 | 网格按「排-列-位」正向落位，空位铺满对齐 | `(dashboard)/shelf-map/page.tsx:243` |
| FIX-2026-1019 | 草稿单绑货位接口，解除「先有鸡还是先有蛋」死锁 | 新增 `api/stock-in/[id]/location/route.ts` |
| FIX-2026-1020 | 统一货位下拉改读 `locations`（原读已空的 `boxes`） | `(dashboard)/stock-in/[id]/page.tsx` |
| FIX-2026-1021 | 序列号追踪无关键词时返回全部并汇总批次号 | `api/serial/route.ts` |
| FIX-2026-1022 | 全站 `Cache-Control: no-store`，修复入库后仍显示旧数据 | `middleware.ts:14` |
| FIX-2026-1023 | 货位独占：一个货位只能放一种商品；接口返回 `occupiedBy`/`isEmpty` | 新增 `src/lib/location-occupancy.ts`；`api/warehouse/locations/route.ts:56` |

---

## FIX-2026-1001 · API 鉴权全局绕过（P0，待修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-11 |
| 严重程度 | 🔴 P0（已实测复现） |
| 影响范围 | 全部 85 个 API 路由；其中 17 个路由文件无内部鉴权，可被完全越权访问 |
| 根因 | `src/middleware.ts` L131–136：请求携带 `Authorization: Bearer *` / `x-api-token` / `?token=`（**任意值**）即放行，未校验 token 内容 |
| 实测证据 | `curl -H "x-api-token: fake123" .../api/inventory` 返回 200 与真实数据；DELETE 同理越过鉴权层 |
| 修复方案 | 删除 middleware 中「有头即放行」分支；需要 API Token 的场景改为调用 `src/lib/token-auth.ts#validateApiToken(request)` 真实校验后再放行 |
| 状态 | ☑ 已修复（2026-10-11 部署上线并复测通过） |

```ts
// 修复示例（src/middleware.ts 认证检查段）
if (pathname.startsWith("/api/")) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) return addSecurityHeaders(NextResponse.next());

  // API Token：真实校验，而不是「有头就放行」
  const { validateApiToken } = await import("@/lib/token-auth");
  const auth = await validateApiToken(request);
  if (auth.valid) return addSecurityHeaders(NextResponse.next());

  return addSecurityHeaders(NextResponse.json({ success: false, error: "请先登录" }, { status: 401 }));
}
```

---

## FIX-2026-1002 · 图形验证码无服务端校验（P0，待修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-11 |
| 严重程度 | 🔴 P0（已实测复现） |
| 影响范围 | 登录防机器人能力为零 |
| 根因 | ① 验证码前端生成、前端校验（`src/app/login/page.tsx`）；② `/api/auth/captcha` GET 在生产环境返回答案字段 `text` |
| 修复方案 | ① 登录 `onFinish` 中先 `POST /api/auth/captcha {token, answer}`（服务端一次性校验，端点已实现），通过后再 `signIn`；② 生产环境 GET 删除 `text` 字段；③ canvas 绘制的文本改为由服务端接口返回的 token 对应（不再本地生成） |
| 状态 | ☑ 已修复（2026-10-11 部署上线并复测通过） |

---

## FIX-2026-1003 · 登录诊断接口导致用户名枚举 + 第二登录口（P1，待修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-11 |
| 严重程度 | 🟠 P1 |
| 影响范围 | `/api/auth/login-check`、`/api/auth/admin-reset (verify)` |
| 根因 | 错误文案区分「用户名不存在 / 账号停用 / 密码错误」；login-check 执行完整密码校验并写审计日志，成为绕过 NextAuth 的旁路认证口 |
| 修复方案 | ① 统一错误文案为「账号或密码错误」；② 废弃 login-check 或改为不传真实密码的轻量探测；③ admin-reset verify 增加独立失败次数限制 |
| 状态 | ☑ 已修复（2026-10-11 部署上线并复测通过） |

---

## FIX-2026-1004 · XFF 伪造绕过限流（P2，待修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-11 |
| 严重程度 | 🟡 P2 |
| 影响范围 | middleware 全局限流（auth 30/min、api 300/min） |
| 根因 | `getRateLimitKey` 取 `x-forwarded-for` 第一段（客户端可控）；nginx `$proxy_add_x_forwarded_for` 将真实 IP 追加在末尾 |
| 修复方案 | 取 XFF **最后一段**，或信任 nginx 设置的 `X-Real-IP`（nginx 已配置 `proxy_set_header X-Real-IP $remote_addr`） |
| 状态 | ☑ 已修复（2026-10-11 部署上线并复测通过） |

---

## FIX-2026-1005 · 依赖漏洞升级（P1~P2，部分待修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-11 |
| 严重程度 | 🟠 P1（next critical）/ 🟡 P2（构建链） |
| 影响范围 | `package.json` 依赖树（npm audit：1 critical / 17 high / 3 moderate） |
| 修复方案与状态 | 见下表 |

| 依赖 | 当前 | 目标 | 动作 | 状态 |
|------|------|------|------|------|
| next | 14.1.0 | 14.2.35 | 升级已上线；注：Next 14 线已 EOL，后续通告修复集中于 15.5.24+，已关闭图片优化器缓解，完整迁移列 v1.1 | ☑ 已修复（14.2.35）→ 升级 Next 15 列入路线图 |
| puppeteer-core | ^24.43.1 | 已移除 | 源码零引用，直接删除依赖（优于升级） | ☑ 已修复 |
| next-auth | ^4.24.5 | ^4.24.11 | 已升级；nodemailer 为传递依赖且项目未启用邮件功能，风险接受 | ☑ 已修复 |
| xlsx | 0.18.5 | exceljs ^4.4.0 | 已替换（仅 1 处写入型用法，重写 batch-download 路由） | ☑ 已修复 |
| tailwindcss | ^3.4.1 | 暂缓 | braces/micromatch 为构建期依赖，不进产物，风险接受 | ☑ 风险接受（文档化） |
| fast-glob / source-map-js / ip-address | — | lockfile 已更新 | 非破坏性升级完成 | ☑ 已修复 |

---

## FIX-2026-1006 · 限流存储与安全配置硬化（P2~P3，待修复）

| 项目 | 内容 |
|------|------|
| 日期 | 2026-10-11 |
| 严重程度 | 🟡 P2 / ⚪ P3 |
| 问题与方案 | ① 限流用进程内存 Map，重启清零、多实例失效 → 迁移 Redis（项目已有 ioredis 依赖）；② CSRF 白名单移除 `http://` 明文 origin；③ `NEXTAUTH_SECRET` 用 `openssl rand -base64 32` 生成并定期轮换 |
| 状态 | ☑ 已修复（2026-10-11 部署上线并复测通过） |

---

## 历史修复记录

| 编号 | 日期 | 内容 |
|------|------|------|
| FIX-2026-0814 | 2026-08-14 | 数据库 Schema 结构调整（存在 `prisma/schema.prisma.bak-box-20260814` 备份，涉及货位/盒子结构变更；细节以 git 历史为准） |
| FIX-2026-0809 | 2026-08-14 | 补充 `SECURITY-REPORT.md`（等保三级自检）；其中部分结论已被 2026-10-11 审计更正，见 `docs/SECURITY.md` |

---

## 维护说明

1. 修复完成后，将状态改为 ☑ 已修复，并在 `CHANGELOG.md` 中记录版本号。
2. 修复涉及安全漏洞时，须同步更新 `docs/SECURITY.md` 的审计结论与实测证据。
3. 提交格式建议：`fix(security): FIX-2026-1001 移除 middleware 任意 token 放行`。
