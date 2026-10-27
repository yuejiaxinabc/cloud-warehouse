# 代码安全审计与修复报告

**项目** inventory-system（云仓智能仓储管理平台）
**仓库** https://github.com/yuejiaxinabc/cloud-warehouse （**public**）
**审计版本** 5670a1c
**日期** 2026-10-27

---

## 一、结论

应用层逻辑本身写得比一般项目扎实（参数化查询全覆盖、NextAuth 鉴权边界正确、
找回密码做了时序防护）。真正的问题出在三处：**密钥被提交进公开仓库**、
**验证码只在前端校验**、**上传接口按客户端声明判断文件类型**。

本次已修复 9 项，代码全部通过类型检查；剩余 3 项需你在运维侧配合完成。

---

## 二、漏洞清单

### 🔴 C-1　NEXTAUTH_SECRET 已泄露到公开仓库（最严重）

`.gitignore` 只写了 `.env`，而项目里存在一个名为 `..env.vNsxxG4DI5` 的副本
（编辑器/导出工具产生的临时文件），被 `git add .` 一起提交了：

```
DATABASE_URL="mysql://warehouse:Wh%402026%23Secure@localhost:3306/warehouse"
NEXTAUTH_SECRET="inventory-system-secret-key-2026-very-long-string"
```

这是 public 仓库，任何人可以直接下载：

```
GET https://api.github.com/repos/yuejiaxinabc/cloud-warehouse/contents/..env.vNsxxG4DI5
→ {"private": false, "visibility": "public"}  HTTP 200
```

**影响**：拿到 `NEXTAUTH_SECRET` 就能离线签发合法的 NextAuth JWT，指定任意
`sub`（用户 ID）即可直接以管理员身份访问全部接口 —— 不需要密码、不需要验证码、
不会产生登录失败记录、不触发任何限速。这比爆破密码严重一个量级。

而且这个密钥本身也够弱：`inventory-system-secret-key-2026-very-long-string`
是人工拼的可读字符串，即便没泄露也在字典攻击范围内。

**修复状态**：代码侧已加两道闸门 —— 启动时记录致命告警，且
`NEXTAUTH_SECRET` 不合格时 middleware 对**全站返回 503**（含登录页、API、
CSRF 接口）。已验证：

```
NEXTAUTH_SECRET='inventory-system-secret-key-2026-very-long-string' npm start

GET /login          → 503 {"success":false,"error":"服务暂不可用，请联系管理员"}
GET /api/users      → 503
GET /api/auth/csrf  → 503
```

**但密钥轮换和 git 历史清理必须你手动执行**，见第四节 —— 代码只能拦住
"继续用弱密钥"，拦不住"这个密钥已经公开"这个事实。

---

### 🔴 C-2　验证码形同虚设，可完全绕过

`/api/auth/captcha` 的存储写在 route 文件内部，NextAuth 的 `authorize()` 访问不到，
所以登录流程是：

```
前端 POST /api/auth/captcha 校验 → 通过后前端才调 signIn()
```

服务端从未校验过验证码。攻击者直接 `POST /api/auth/callback/credentials`
就跳过了整个验证码环节。

**实测确认**：连续 10 次直接打 callback（不带任何 captcha 字段），
10 次全部进入密码校验流程，无一次被拦。

**修复状态**：✅ 已修复。验证码存储抽到 `src/lib/captcha-store.ts`，
`authorize()` 内一次性消费；登录页改为把 `captchaToken`/`captchaAnswer`
随 `signIn()` 一起提交。

修复后直接打 callback（绕过前端）实测：

```
不带任何验证码        → error=验证码参数错误
伪造 captchaToken     → error=验证码已过期，请刷新   ← 票据不存在，无法伪造
有效票据 + 错误答案   → error=验证码错误，票据当即销毁
同一票据重放          → error=验证码已过期，请刷新
```

---

### 🔴 C-3　文件上传可写入 .html → 存储型 XSS → 账号接管

原实现：

```ts
if (!file.type.startsWith("image/")) reject();   // 客户端声明的 Content-Type
const ext = file.name.split(".").pop();          // 客户端声明的扩展名
await writeFile(path.join(publicUploads, name), buffer);
```

两处判断都取自客户端。上传 `evil.html`，把 Content-Type 伪造成 `image/png`，
文件就落地成 `public/uploads/xxx.html`，再由 Next 以 `text/html` 返回。

本项目 JWT 存 localStorage，一个 XSS 就能直接读走会话 —— 配合 C-1 是完整的
"发个链接给管理员 → 拿到后台"链路。

**修复状态**：✅ 已修复。改为按文件头魔数嗅探真实类型，扩展名只从
白名单推导（不接受任何客户端输入），显式拒绝 SVG（可内嵌 script），
文件名改用 crypto 随机。

---

### 🟠 H-1　登录响应可枚举用户名

```ts
if (!user) throw new Error('用户名或密码错误');
if (!isValid) throw new Error(`密码错误，还剩${remaining}次尝试机会`);
```

密码错时返回"还剩 N 次"，说明该用户存在；用户不存在时是另一句文案。
这本身就是一个用户名枚举预言机，配合 C-2 可直接筛选有效账号。

另外 `bcrypt.compare` 只在用户存在时才执行，响应时间差也是枚举通道。

**修复状态**：✅ 已修复。统一为 `账号或密码错误`，用户不存在时也跑一次
dummy bcrypt 保证耗时一致。

---

### 🟠 H-2　登录失败锁定可被用来打死管理员

```ts
const loginAttempts = new Map<string, {count, lastAttempt}>();
// key = username
```

只按用户名计数。攻击者对 `admin` 连打 5 次错误密码，管理员就被锁 30 分钟 ——
一个不需要任何凭据的拒绝服务。Map 还是进程内的，多实例下各算各的。

**修复状态**：✅ 已修复。改为 **IP + 账号双维度**，走 Redis 固定窗口
（`src/lib/rate-limit.ts`），Redis 不可用时降级进程内并告警。账号维度
不再做硬锁定，避免被拿来打 DoS。

---

### 🟠 H-3　CSRF 同源校验可绕过

```ts
const a = new URL(sourceOrigin);
const b = new URL(getRequestOrigin(request));  // ← 优先读 X-Forwarded-Host
return a.host === b.host;
```

`getRequestOrigin` 优先取 `X-Forwarded-Host`，而这是普通请求头，客户端可以
自己设。攻击者同时伪造 `Origin` 与 `X-Forwarded-Host` 为同一个值，
"同源"判定就通过了。

**修复状态**：✅ 已修复。改为与请求实际的 `Host` 头比对（Host 由浏览器从
URL 得出，脚本无法改写），env 白名单只用于放行小程序等已知跨域来源。

---

### 🟠 H-4　API Token 生成用 Math.random()，且校验 fail-open

```ts
export function generateApiToken() {
  token += chars.charAt(Math.floor(Math.random() * chars.length));  // 非 CSPRNG
}
export async function verifyApiToken(headers) {
  if (!validToken) return { valid: true };   // 没配置就放行
}
```

V8 的 `Math.random` 是 xorshift128+，状态可从若干输出反推，生成的 token 可预测。
校验侧"未配置即放行"意味着任何忘记配置的环境对公网裸奔。

**修复状态**：✅ 已修复。改用 `crypto.randomBytes`，校验改 fail-closed，
比较用 `timingSafeEqual`。

---

### 🟡 M-1　限速全在进程内，多实例失效

middleware 的 `rateLimitStore` 和 `loginAttempts` 都是进程内 Map。多实例部署
等于限速值乘以实例数，重启即清零。

**修复状态**：✅ 已修复（Node runtime 侧走 Redis）。middleware 那层保留作为
Edge 侧廉价第一道，已在注释里标明它不是权威计数。

---

### 🟡 M-2　`hasRole` 大小写不一致（潜伏缺陷）

```ts
export function hasRole(roles, required) {
  return roles.includes(required) || roles.includes('ADMIN');   // 大写
}
```

数据库里 `role.code` 是 `'admin'`（见 `prisma/seed.ts`）。当前无调用方，
但一旦有人拿它做鉴权判断，管理员识别会失效。

**修复状态**：✅ 已修复，改为大小写不敏感比较。

---

### 🟡 M-3　`/api/inventory`、`/api/warehouse/structure` 无显式鉴权

这两个路由内部没有 `requireAuth`，完全依赖 middleware 兜底。middleware 一旦
被误改（比如加进 PUBLIC_API），数据就裸奔。属于纵深防御缺失。

**状态**：未改。建议补 `await requireAuth(req)`，风险不高但值得加。

---

### 🟡 M-4　错误信息回显 `error.message`

多处 `catch (e) { return json({ error: e.message }, { status: 500 }) }`，
可能把 Prisma/文件路径信息带给客户端。项目已有 `handleApiError` 做脱敏，
但并非所有路由都用。

**状态**：未逐个改（影响面大，容易改出回归）。建议后续统一替换为
`handleApiError(error)`。

---

## 三、本次代码改动

| 文件 | 改动 |
|---|---|
| `src/lib/captcha-store.ts` | **新增** 验证码共享存储，route 与 authorize 共用 |
| `src/lib/rate-limit.ts` | **新增** Redis 优先 + 内存降级的限速/计数 |
| `src/lib/env-guard.ts` | **新增** NEXTAUTH_SECRET 强度体检，弱密钥生产环境拒绝启动 |
| `src/lib/auth.ts` | 验证码服务端强制、双维度限速、统一错误文案、恒定时间校验、cookie 安全属性显式声明、`hasRole` 修复 |
| `src/middleware.ts` | CSRF 改用 Host 比对、公开路由精确匹配、补 HSTS/Permissions-Policy |
| `src/app/api/upload/route.ts` | 魔数嗅探 + 扩展名白名单 + crypto 文件名 |
| `src/lib/api-token.ts` | crypto 随机 + fail-closed + timingSafeEqual |
| `src/app/api/auth/captcha/route.ts` | 改用共享 store |
| `src/app/login/page.tsx` | 验证码随 signIn 提交，不再前端预验 |
| `src/lib/redis.ts` | 补 `error` 监听（否则连接失败会打挂进程） |
| `.gitignore` | 补 `.env.*` / `..env*` / 证书 / 上传目录等规则 |

类型检查：改动文件 **0 错误**（项目原有 76 处历史类型错误未动，由
`ignoreBuildErrors` 掩盖，与本次无关）。

---

## 四、必须你手动完成的三件事

### 1. 轮换密钥（优先级最高）

代码里的自检只能阻止弱密钥，**已泄露的密钥必须换掉**，否则 C-1 依然成立。

```bash
# 服务器上
openssl rand -base64 48        # 复制输出

# /var/www/xxx/.env
NEXTAUTH_SECRET="<粘贴上面生成的值>"

# 数据库改密码
ALTER USER 'warehouse'@'localhost' IDENTIFIED BY '<新密码>';
# 同步更新 .env 里的 DATABASE_URL（记得 URL 转义：@ -> %40，# -> %23）

pm2 restart all   # 或 systemctl restart 你的服务
```

> 换 secret 会让所有现存会话立即失效（所有人需重新登录），这是期望行为。

### 2. 清除 git 历史里的密钥

`git rm --cached` 只是不再跟踪，**历史提交里仍然有**，GitHub 上照样能翻到。
必须重写历史：

```bash
pip install git-filter-repo
cd /path/to/cloud-warehouse

git filter-repo --path '..env.vNsxxG4DI5' --invert-paths --force

# 强推（会改写所有 commit hash，协作者需要重新 clone）
git remote add origin https://github.com/yuejiaxinabc/cloud-warehouse.git
git push origin --force --all
git push origin --force --tags
```

推完还要让 GitHub 清缓存，否则旧 commit 的页面可能仍可访问：

- 提交 GitHub Support 工单，请求 purge 已删除的 commit / 让 fork 失联
- 或直接**删库重建**（最干净，历史短的话推荐这个）

⚠️ 只要这个 secret 在公开历史里存续过，就必须按第 1 步轮换 —— 清历史
不能挽回已经泄露的事实。

### 3. 确认 .env 不再产生同类副本

`..env.vNsxxG4DI5` 这种文件名通常来自编辑器的自动备份或
`cp .env .env.xxx` 之类的操作。新 `.gitignore` 已覆盖 `..env*` 和 `.env.*`，
但建议顺便查一下是谁在生成：

```bash
git log --all --diff-filter=A --name-only | grep -i env
```

---

## 五、验证方法

修复上线后，这几项应全部符合预期：

```bash
H=https://warehouse.yuejiaxin.ln.cn

# 1. 验证码是否真的强制了（应该失败）
curl -s -X POST $H/api/auth/callback/credentials \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'username=admin&password=wrong&csrfToken=x&callbackUrl=/'
# 期望：错误信息是「验证码...」，而不是「账号或密码错误」

# 2. 用户名枚举（存在与不存在应返回同样文案）
#    —— 先取真实验证码再对比两种用户名，文案必须完全一致

# 3. 上传 html 是否被拒
curl -s -X POST $H/api/upload -b 'session-token=...' \
  -F 'file=@evil.html;type=image/png'
# 期望：{"success":false,"error":"只支持 JPG / PNG / GIF / WEBP 图片"}

# 4. 弱密钥是否拒绝启动
NEXTAUTH_SECRET=inventory-system-secret-key-2026-very-long-string npm start
# 期望：进程启动即抛错退出
```

---

## 六、没做但建议做的

1. `/api/inventory`、`/api/warehouse/structure` 补 `requireAuth`（M-3）
2. 全站 `catch` 统一走 `handleApiError`（M-4）
3. 会话 JWT 从 localStorage 换成 HttpOnly cookie。NextAuth 本身已用 cookie，
   但前端 `useAuth` 仍读 localStorage 存副本，那部分副本是 XSS 的现成目标
4. `Server` 头与 `X-Powered-By` 已在 nginx 侧处理，见上一份服务器加固报告
5. 给 `/api/auth/admin-reset` 的 `verify` 加独立限速 —— 现在它靠一个全局
   共享令牌重置任意用户密码，令牌一旦被猜到就是全站接管
