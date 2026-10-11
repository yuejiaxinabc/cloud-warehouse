# 修复文档（FIXLOG.md）

> 本文档记录系统的已知问题、修复方案与修复进度。每条记录包含：问题编号、严重程度、影响范围、根因、修复方案、状态。
> 新增条目请按 `FIX-YYYY-####` 递增编号，从上往下按时间倒序排列。

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
