# 开发文档（DEVELOPMENT.md）

> 面向参与本项目开发的工程师。读完这篇，你应当能在 30 分钟内搭好开发环境并提交第一行代码。
> 部署上线请看《用户使用手册》（含部署篇）；安全要求见 `docs/SECURITY.md`。

---

## 1. 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | Next.js（App Router） | 14.1.0（计划升 14.2.35） |
| 语言 | TypeScript | 5.3 |
| UI | Ant Design 5 + Tailwind CSS 3 | — |
| ORM | Prisma | 5.10 |
| 数据库 | MySQL（InnoDB / utf8mb4） | 5.7+（推荐 8.0） |
| 认证 | NextAuth.js（Credentials + JWT） | 4.24 |
| 缓存 | ioredis（可选） | 5.3 |
| 图表 | Recharts | 2.12 |
| 导出 | xlsx（计划换 exceljs，见 FIXLOG） | 0.18 |
| 条码/扫码 | jsbarcode、html5-qrcode | — |

## 2. 本地环境搭建

```bash
# 0) 前置：Node.js >= 18（推荐 20/22/24）、MySQL 5.7+/8.0、Git
node -v && mysql --version

# 1) 克隆并安装
git clone <仓库地址> inventory-system
cd inventory-system
npm install

# 2) 配置环境变量
cp .env.example .env
# 生成 NEXTAUTH_SECRET：
openssl rand -base64 32
# .env 内容：
# DATABASE_URL="mysql://root:password@localhost:3306/inventory_db"
# NEXTAUTH_SECRET="<上面生成的随机串>"
# NEXTAUTH_URL="http://localhost:3000"
# REDIS_URL="redis://localhost:6379"   # 可选

# 3) 初始化数据库
npx prisma generate        # 生成 Prisma Client
npx prisma db push         # 建表（约 40 张）
npx ts-node prisma/seed.ts # 播种演示数据与预置账号

# 4) 启动
npm run dev                # http://localhost:3000
```

### 预置账号（seed 数据）

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | Admin@123 | 系统管理员 |
| wh_manager | User@123 | 仓库主管 |
| wh_keeper | User@123 | 仓管员 |
| buyer | User@123 | 采购员 |
| sales | User@123 | 销售员 |
| auditor | User@123 | 审计员 |

> 本地开发可用 MySQL Docker：`docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=inventory_db mysql:8.0`

## 3. 目录结构

```
src/
├── app/
│   ├── (dashboard)/        # 登录后所有页面（路由分组共享侧边栏布局）
│   │   ├── page.tsx        # 工作台
│   │   ├── products/       # 商品管理
│   │   ├── purchase-requests/ # 采购申请
│   │   ├── stock-in/       # 入库
│   │   ├── stock-out/      # 出库
│   │   ├── inventory/      # 库存查询
│   │   ├── stocktake/      # 盘点
│   │   ├── transfers/      # 调拨
│   │   ├── warehouse/      # 仓库（区域→货位→盒子）
│   │   ├── shelf-map/      # 货架地图
│   │   ├── suppliers/      # 供应商
│   │   ├── customers/      # 客户
│   │   ├── alerts/         # 预警中心
│   │   ├── reports/        # 报表
│   │   ├── bom/            # BOM 物料清单
│   │   ├── serial/         # 序列号追踪
│   │   ├── labels/         # 条码打印
│   │   ├── export/         # Excel 导出
│   │   ├── cost/           # 成本核算
│   │   ├── logs/           # 操作日志
│   │   └── settings/       # 系统设置（用户/角色/上传/API Token）
│   ├── api/                # Route Handlers（85 个路由文件）
│   │   ├── v1/mp/          # 微信小程序端 API（独立 mpSession 鉴权）
│   │   └── auth/           # NextAuth + 验证码 + 密码重置
│   ├── login/  reset-password/  terms/  privacy/
│   └── layout.tsx
├── components/             # layout（侧边栏）与 ui 通用组件
├── lib/
│   ├── prisma.ts           # Prisma 单例
│   ├── auth.ts             # NextAuth 配置（JWT 会话，含角色注入）
│   ├── auth-guard.ts       # requireLogin/requireAdmin/requireAuth
│   ├── token-auth.ts       # 开放接口 API Token 校验（注意 FIX-2026-1001）
│   ├── mp-auth.ts          # 小程序会话校验
│   ├── log.ts              # 审计日志
│   └── validators.ts       # Zod 入参校验
├── services/               # 业务服务层
└── types/
prisma/
├── schema.prisma           # 数据模型（~40 表）
└── seed.ts                 # 演示数据
wxapp/                      # 微信小程序端（独立目录）
```

## 4. 认证与权限模型

三层认证，写新路由前先想清楚你的接口属于哪一层：

1. **Web 会话（NextAuth JWT）**：middleware 校验 JWT → 路由内部用 `getServerSession` 或 `auth-guard.ts` 的 `requireLogin()` / `requireAdmin()` 做二次校验。**middleware 不是安全边界，路由内部必须自行鉴权**。
2. **API Token（开放接口）**：`x-api-token` 头，对应 `api_tokens` 表（含权限列表、过期时间）。经 `validateApiToken` 校验。⚠️ 当前 middleware 存在任意 token 放行漏洞（FIX-2026-1001），修复前请勿依赖 middleware 层。
3. **小程序会话**：`/api/v1/mp/*` 使用 `mpSession` 表 token（30 天），经 `mp-auth.ts#requireMpToken` 校验。

RBAC：用户→角色→权限。角色编码 `admin` 拥有全部权限；细粒度权限以 `模块:操作` 字符串表示（如 `stock-in:approve`）。

## 5. 核心业务规则（改库存相关代码前必读）

- **账实一致三件套**：任何出入库操作必须同时落地 ①单据（stock_in/stock_out/transfers）②库存（inventory）③流水（inventory_transaction），放在同一个 Prisma `$transaction` 里。
- **防超卖（乐观锁）**：
  ```sql
  UPDATE inventory SET on_hand = on_hand - ? WHERE product_id = ? AND warehouse_id = ? AND on_hand >= ?
  ```
  影响行数为 0 即库存不足，必须回滚报错，禁止「先查再减」。
- **成本核算**：入库时移动加权平均 `新成本 = (原结存金额 + 本次入库金额) / (原结存数量 + 本次入库数量)`；FIFO 按批次入库时间升序消耗。
- **可用量**：`available = on_hand - locked`；锁定 = 已分配未发 + 在途 + 盘点冻结。

## 6. API 约定

- 统一响应：`{ success: boolean, data?: T, error?: string, message?: string }`
- 分页：`?page=1&pageSize=20`，返回 `{ items, total, page, pageSize }`
- BigInt 序列化：Prisma 的 BigInt 必须过 `src/lib/serialize.ts#serializeBigInt` 再返回，否则 JSON.stringify 会抛错。
- 入参校验：新接口一律用 Zod（`lib/validators.ts`）或至少手动校验类型；错误信息返回 400。
- 状态变更接口（POST/PUT/DELETE）自动受 middleware 的 Origin 校验（CSRF）保护，新增跨域客户端（如小程序）需在 `ALLOWED_ORIGINS` 中登记。

## 7. 编码与提交规范

- TypeScript 严格模式；组件用函数组件 + hooks；服务端逻辑不写进客户端组件。
- 提交信息：`feat|fix|refactor|docs|chore(scope): 描述`，涉及安全问题需引用 FIXLOG 编号。
  - 例：`fix(security): FIX-2026-1001 移除 middleware 任意 token 放行`
- 分支：`main` 为可发布分支，功能开发走 `feat/xxx` 分支 + PR。
- 新增数据表：改 `schema.prisma` → `npx prisma db push`（开发期）/ `prisma migrate dev`（需要迁移历史时）→ 同步更新本文件第 3 节。

## 8. 调试与日志

- 开发：`npm run dev`，终端看路由日志；数据库可视化 `npm run db:studio`（Prisma Studio）。
- 生产（systemd 部署）：`journalctl -u inventory.service -f`。
- 审计日志：页面「操作日志」或 `audit_logs` 表；`writeLog({ module, action, content, userId, ip })`。

## 9. 已知技术债

见 `docs/FIXLOG.md`（middleware 鉴权绕过、验证码服务端化、login-check 收敛、next/xlsx 升级等）。**新贡献者做第一个 PR，强烈建议从 FIXLOG 挑一条 P0/P1 入手。**
