# 安全测试报告（SECURITY.md）

> 最后审计时间：2026-10-11 · 审计方式：黑盒实测 + 代码审查 + 依赖扫描
> **修复状态：P0/P1/P2 代码类漏洞已于 2026-10-11 当日修复上线并复测通过（详见 FIXLOG）；Next 14 EOL 余留通告以关闭图片优化器缓解，Next 15 迁移列入 v1.1 路线图。**
> 适用版本：v1.0.0（git commit `5ec72e0`）

本文件包含两部分：**安全测试报告**（针对当前代码的真实测试结论）与**漏洞披露政策**（如果你发现了安全问题该怎么做）。

---

## 一、测试环境与方法

| 项目 | 内容 |
|------|------|
| 测试对象 | `warehouse.yuejiaxin.ln.cn`（线上）与 `/opt/inventory-system` 源码 |
| 黑盒工具 | curl（鉴权绕过验证）、dig（端口暴露面）、浏览器自动化（验证码机制验证） |
| 白盒工具 | 人工代码审查（85 个 API 路由、middleware、认证库） |
| 依赖扫描 | `npm audit --package-lock-only`（1 critical / 17 high / 3 moderate） |

> ⚠️ 本次所有验证均在**系统所有者授权**下进行，且未对真实业务数据做任何修改（越权写操作使用不存在的 ID 验证，仅确认鉴权是否被绕过，不触碰真实记录）。

---

## 二、漏洞清单（按严重程度排序）

### 🔴 P0-1 · API 鉴权全局绕过（已实测复现，最高危）

- **位置**：`src/middleware.ts` 第 131–136 行
- **问题**：API 请求只要携带 `Authorization: Bearer <任意值>`、`x-api-token: <任意值>` 或 URL 参数 `?token=<任意值>`，middleware 就直接放行——**完全不校验 token 内容**。设计意图是放行「持有合法 API Token 的开放接口调用方」，但实现上只判断了「有没有这个头」，真正的 token 校验（`validateApiToken`）只在极少数路由内部调用。
- **实测证据**：
  ```bash
  # 无 token → 正确返回 401
  curl "https://<域名>/api/inventory?pageSize=1"            # → 401 请先登录
  # 伪造 token 头（任意值）→ 绕过鉴权，返回真实库存数据
  curl -H "x-api-token: fake123" "https://<域名>/api/inventory?pageSize=1"
  # → 200 {"success":true,"data":{"items":[...],"total":...}}
  # 同样可越权删除库存（用不存在的 ID 验证，已到达业务逻辑层）：
  curl -X DELETE -H "x-api-token: fake123" "https://<域名>/api/inventory?id=99999999"
  # → {"success":false,"error":"库存记录不存在"}   ← 说明已通过鉴权
  ```
- **影响**：未登录攻击者可**读取全部库存数据**、**删除库存记录**，以及访问所有不在路由内部做二次鉴权的 API（85 个路由文件中 17 个无内部鉴权检查）。
- **修复与复测**：✅ 已修复——middleware 仅对 `/api/v1/*`（路由内部有真实校验）放行带 token 头的请求，其余一律要求 NextAuth 会话。复测三种伪造头访问 `/api/inventory` 均 401。

### 🔴 P0-2 · 图形验证码形同虚设（已实测复现）

- **位置**：`src/app/login/page.tsx`、`src/app/api/auth/captcha/route.ts`
- **问题**（双重点）：
  1. 验证码在**前端本地生成**（`genCaptchaText()`）并画到 canvas 上，登录时也在**前端本地比对**（`onFinish` 里 `captchaInput.toUpperCase() !== captcha.toUpperCase()`），服务端完全不参与校验；
  2. 服务端 `/api/auth/captcha` GET 接口反而把答案 `text` 字段直接返回给了客户端（代码注释承认这是调试用，但生产未移除）。
- **实测证据**：浏览器自动化脚本直接从 canvas 截图读出答案（4 位明文），填写任意账密即可进入 NextAuth 认证流程。验证码对机器人的拦截能力为零。
- **影响**：脚本可无限次尝试撞库（受限于 30 次/分钟/IP 的登录限流）；验证码防机器人功能实际失效。
- **修复与复测**：✅ 已修复——GET 仅返回 `{token, svg}`（答案不出服务端）；登录页先 POST 服务端校验再 `signIn`。复测：错误码被拒、正常登录成功。

### 🟠 P1-1 · 用户名枚举（代码确认）

- **位置**：`src/app/api/auth/login-check/route.ts`（公开端点）、`src/app/api/auth/admin-reset/route.ts` 的 `verify` 分支
- **问题**：`login-check` 对「用户名不存在」「账号已停用」「密码错误」返回**不同的错误文案**，攻击者可批量探测系统中存在的用户名。
- **修复方案**：统一返回「账号或密码错误」；停用状态留到登录成功后提示。

### 🟠 P1-2 · login-check 形成第二登录口（代码确认）

- **位置**：同上
- **问题**：该公开端点执行完整的 bcrypt 密码校验并写审计日志，绕过了 NextAuth 的会话签发，等于一个绕过登录锁定的旁路认证口，且可被用于批量刷写审计日志（污染日志）。
- **缓解**：已有 30 次/分钟/IP 限流。
- **修复方案**：前端登录失败后的「诊断调用」改为不传真实密码的轻量探测，或直接废弃该端点，认证唯一入口收敛到 NextAuth。

### 🟠 P1-3 · 依赖链存在 Critical/High 漏洞（npm audit）

| 依赖 | 等级 | 问题 | 建议 |
|------|------|------|------|
| `next 14.1.0` | **Critical** | Server Actions SSRF（CVE-2025-29927 类）、缓存投毒 | 升级到 `14.2.35`（14.x 内小版本升级，改动可控） |
| `xlsx 0.18.5` | High | 原型污染 + ReDoS（npm 渠道**无修复版**，SheetJS 已迁出 npm） | 换 `exceljs`，或评估风险后锁定（导出功能仅登录用户可达） |
| `nodemailer`（经 next-auth） | High | SMTP 命令注入 | 项目未启用邮件功能，实际风险低；随 next-auth 升级解决 |
| `braces/micromatch/chokidar`（经 tailwindcss 3） | High | ReDoS / DoS | 构建期依赖，不进产物；升级 tailwindcss 4 解决（需适配） |
| `puppeteer-core 24` | High | extract-zip 路径穿越等（供应链链路） | 升级到 `25.13.0` |
| `postcss / source-map-js / ip-address` | High/Moderate | 构建期 / SSRF 边缘问题 | `npm audit fix` 可解决一部分 |

### 🟡 P2-1 · X-Forwarded-For 可伪造绕过限流

- **位置**：`src/middleware.ts` `getRateLimitKey()` 取 `x-forwarded-for` 的**第一段**；而 nginx 用 `$proxy_add_x_forwarded_for` 把真实 IP **追加在末尾**，第一段是客户端可控的。
- **影响**：攻击者每次请求伪造不同的 XFF 即可绕过登录限流（配合 P0-2 风险放大）。
- **修复方案**：取 XFF 最后一段，或直接信任 nginx 设置的 `X-Real-IP`。

### 🟡 P2-2 · 其他中低风险项

| 编号 | 问题 | 建议 |
|------|------|------|
| P2-3 | 限流存储为进程内存 Map，重启清零、多实例失效 | 迁移到 Redis（项目已依赖 ioredis） |
| P2-4 | CSRF 白名单包含 `http://warehouse.yuejiaxin.ln.cn` 明文 origin | 移除 http 条目（80 端口已 301 到 https） |
| P2-5 | `NEXTAUTH_SECRET` 强度未强制 | 使用 `openssl rand -base64 32` 生成并定期轮换 |
| P2-6 | `admin-reset` verify 分支可被用来探测令牌（有 bcrypt 与限流缓解） | 对 verify 增加独立失败计数与延迟 |

---

## 三、实测确认的良好实践（值得保留）

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `.env` 不入 Git | ✅ | `.gitignore` 已排除，仓库中仅 `.env.example` |
| 密码存储 | ✅ | bcrypt cost=12 |
| SQL 注入 | ✅ | 全项目无字符串拼接 SQL；`token-auth.ts` 的 `$queryRaw` 使用 Prisma 参数化模板 |
| 传输加密 | ✅ | Let's Encrypt TLS + HSTS（max-age=31536000） |
| 安全响应头 | ✅ | CSP / X-Frame-Options: DENY / nosniff 等齐全（nginx + middleware 双层） |
| 数据库暴露面 | ✅ | MySQL 3306 仅绑定 127.0.0.1（实测） |
| 应用端口 | ✅ | 3000 端口未对外开放（实测连接超时），仅 nginx 反代可达 |
| 防火墙 | ✅ | ufw 仅放行 22/80/443 |
| systemd 加固 | ✅ | NoNewPrivileges / ProtectSystem=full / PrivateTmp 等已启用 |
| 超卖防护 | ✅ | 库存扣减使用乐观锁（`WHERE on_hand >= ?` 条件更新） |
| 操作审计 | ✅ | 关键操作写 audit log（含 IP 与平台） |

### 对旧报告的更正声明

仓库中原有的 `SECURITY-REPORT.md`（2026-08-12）中「API 权限检查 68/72 通过 ✅」的结论**与实测不符**：middleware 的任意 token 放行（P0-1）使该结论失效。以本报告为准。旧报告已移至 `docs/archive/SECURITY-REPORT-v1.0.0.md`，作为历史记录保留，但其中与本文冲突的结论均按本文修正。

---

## 四、漏洞披露政策

- 发现安全漏洞请**不要**直接在公开 Issue 中披露细节。
- 请通过 Security Advisory（GitHub 仓库 Security 标签页 → Report a vulnerability）私下报告，或联系仓库维护者。
- 我们承诺：**48 小时内**确认收到；**7 天内**给出评估与修复计划；修复发布后在 CHANGELOG 中致谢报告者（除非你要求匿名）。
- 请勿对线上环境进行任何影响可用性或数据完整性的测试（DoS、数据删除、注入真实脏数据等）。

---

## 五、修复跟踪

所有漏洞的修复进度统一记录在 [`docs/FIXLOG.md`](./FIXLOG.md)。
