# 迭代记录与路线（CHANGELOG.md）

> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`。
> 功能迭代记录在「版本历史」；后续方向在「迭代路线」。欢迎在 Issue 中提出需求 → 可能进入下一版本路线。

---

## 版本历史

### v1.0.2（2026-10-27 · 安全复检 + 货位闭环）

> 基线 v1.0.1（`5670a1c`）。本次以**服务器实际运行代码**为准（29 个文件变更，`+1126 / −629`），
> 已部署上线（systemd `cloud-warehouse` active，BUILD_ID `v7cyDypXcFQYmpjdAoBX-`）。
> 逐项说明见 [`docs/UPDATE-2026-10-27.md`](UPDATE-2026-10-27.md)。

- ✅ **FIX-2026-1012（P0）** 安全复检九项：验证码改为 `authorize()` 内一次性消费（原存储写在 route 内，`authorize()` 访问不到 → 直接打 callback 可完全绕过）；CSRF 同源基准由可伪造的 `X-Forwarded-Host` 改为请求真实 `Host`；上传改按**文件头魔数**嗅探 + 扩展名白名单 + `crypto` 随机名（原按客户端 `Content-Type`/后缀判断，可上传 `.html` 造成存储型 XSS）；`NEXTAUTH_SECRET` 弱密钥全站 503（fail-closed）；API Token 改 `crypto.randomBytes` + fail-closed + `timingSafeEqual`；登录改 IP+账号双维度限速并统一错误文案（消除用户名枚举与「打 5 次锁死管理员」DoS）；会话 Cookie 显式声明安全属性；`hasRole()` 大小写不敏感；补 ioredis `error` 监听；关闭 `X-Powered-By`
- ✅ **FIX-2026-1013（P0）** 货位闭环：`InboundItem.locationId` 落库，入库过账必须带合法四段货位（`区-排-列-位`），同步写 `inventory.locationId` 与 `location_stocks`；新增 `location-binding` / `location-occupancy`；货架地图对历史数据按 `inventory.location_id` 兜底，修复「库存有货、货架地图空白」
- ✅ **FIX-2026-1014** 新建仓库统一生成 A–Z 共 26 个货架、每架 10×10=100 个货位（原仅 A–M 且编码不补零，与四段规则冲突）；新增幂等补齐接口 `POST /api/warehouse/shelves/init`
- ✅ **FIX-2026-1015（P0）** 数据导出三处故障：盘点记录 `prisma.stocktakeOrder` 模型不存在（应为 `countOrder`）→ 500；调拨 / 库存流水引用 schema 中不存在的关系与字段 → 400，均改为外键/Map 映射
- ✅ **FIX-2026-1016** 新增「库存分析」页 `/inventory/analysis`（账实对账 / 呆滞库龄 / ABC 分类 / 补货建议四类）；扫码入库、扫码出库点击即拉起摄像头
- ✅ **FIX-2026-1017** 货架地图不再给货位编码追加 `-1/-2` 序号（四段变五段），一个货位就是一条 `Location`
- ✅ **FIX-2026-1018** 货架地图网格改为按「排-列-位」正向落位，空位同样铺满对齐
- ✅ **FIX-2026-1019** 新增草稿入库单绑货位接口 `POST /api/stock-in/[id]/location`，解除「过账要求先有货位、货位只能过账后放置」的死锁
- ✅ **FIX-2026-1020** 统一货位选择改读 `locations`（原读已空的 `boxes` 表，下拉永远为空）
- ✅ **FIX-2026-1021** 序列号追踪无关键词时返回全部商品并汇总批次号（原来直接返回空数组，页面空白）
- ✅ **FIX-2026-1022** 全站响应补 `Cache-Control: no-store`（Next 默认长缓存导致入库后仍显示旧数据）
- ✅ **FIX-2026-1023** 货位独占校验：一个货位只能放同一种商品；货位接口返回 `occupiedBy` / `isEmpty`
- ✅ **FEAT-2026-1024** 商品导入导出：`/products/io` + 模板/导出/导入/元信息四个接口，模板按「有无仓库」动态增减「仓库」「货位编码」列
- ✅ **DATA-2026-1025** 种子脚本改为幂等 `upsert`，仅初始化组织/权限/角色/账号，不含任何业务数据
- 🔴 **运维遗留**：`NEXTAUTH_SECRET` 曾随 `..env.vNsxxG4DI5` 提交进公开仓库，**必须轮换并清理 git 历史**（代码只能拦「继续用弱密钥」，拦不住「已泄露」）
- 🔶 未处理：80 端口未强制跳 HTTPS；`/api/inventory`、`/api/warehouse/structure` 缺内部 `requireAuth`；`ignoreBuildErrors` 仍为 true

### v1.0.1（2026-10-11 · 安全加固版）

安全审计后的集中修复版本，全部改动已部署上线并复测通过：

- ✅ **FIX-2026-1001（P0）** 移除 middleware「任意 token 头即放行」逻辑；`/api/v1/*` 开放接口由路由内部真实校验 token，其余 API 仅认 NextAuth 会话。复测：伪造 `x-api-token`/`Bearer`/`?token=` 访问 `/api/inventory` 全部 401
- ✅ **FIX-2026-1002（P0）** 验证码改服务端生成 SVG + 服务端一次性校验，登录接口不再返回答案文本。复测：错误验证码被拒、正常登录流程通过
- ✅ **FIX-2026-1003（P1）** login-check 降级为固定文案空壳（不可再枚举用户名/绕过登录）；admin-reset verify 统一错误文案并对用户不存在的情况做等时比较
- ✅ **FIX-2026-1004（P2）** 限流 IP 取值改用 X-Real-IP / XFF 末段，杜绝伪造绕过
- ✅ **FIX-2026-1005** next 14.1.0→14.2.35；移除未使用的 puppeteer-core；xlsx→exceljs（重写采购批量下载路由）；next-auth ^4.24.11；关闭未使用的图片优化器（缓解 Next 14 EOL 余留通告）；构建链非破坏性升级
- ✅ **FIX-2026-1006** CSRF 白名单移除 http 明文来源
- ℹ️ Next 15 迁移（清零全部 Next 余留通告）与 Redis 限流列入 v1.1 路线图

### v1.0.0（当前基线 · 2026-10 快照 `5ec72e0`）

首个公开基线版本。经实测验证的完整功能清单：

**核心模块（8 大）**
- ✅ 商品/物料管理：SKU、分类体系、单位管理、规格属性、供应商关联、条码
- ✅ 采购申请：申请→审批流
- ✅ 入库管理：采购/退货/生产/其他入库、扫码入库（html5-qrcode）、手动创建
- ✅ 出库管理：销售/领料出库、审批流程、乐观锁防超卖、扫码出库
- ✅ 库存查询：实时结存、可用量（on_hand − locked）、批次/序列号维度
- ✅ 盘点管理：全盘/循环盘点、差异调整
- ✅ 仓库与调拨：多仓库、区域→货位→盒子三级结构、货架地图可视化、移库调拨
- ✅ 预警中心：低库存/高库存/临期/呆滞

**扩展模块**
- ✅ BOM 物料清单
- ✅ 序列号追踪
- ✅ 条码标签打印（jsbarcode）
- ✅ 成本核算（移动加权平均 / FIFO）
- ✅ 通用 Excel 导出

**系统与多端**
- ✅ 用户/角色/权限（RBAC）、操作日志审计
- ✅ 个人资料、修改密码、管理员重置令牌找回机制
- ✅ 系统设置（企业信息、上传配置 local/OSS、API Token 管理）
- ✅ 微信小程序端（**独立项目**，不在本仓库内）：登录、看板、出入库、盘点、库存搜索、采购，文档见小程序仓库 README：https://github.com/yuejiaxinabc/cloud-warehouse-wxapp
- ✅ 系统名称/客服电话等品牌信息可配置

**基础设施**
- ✅ NextAuth JWT 会话 + 中间件安全头 + CSRF Origin 校验 + 接口限流
- ✅ Nginx 反代 + HTTPS（Let's Encrypt）+ systemd 托管（含安全加固选项）

**已知问题**：见 `docs/FIXLOG.md`（2026-10-11 安全审计发现的 P0×2、P1×3 及依赖升级项，均在待修复状态）。

---

## 迭代路线（Roadmap）

> 优先级：🔴 安全修复（随 v1.0.1 立即发布）→ 🟠 体验与可靠性 → 🟢 生态与扩展。欢迎认领！

### v1.0.1 · 安全加固（已发布，见版本历史）
- [ ] 修复 middleware 任意 token 放行（FIX-2026-1001，P0）
- [ ] 验证码服务端校验 + 生产去掉答案字段（FIX-2026-1002，P0）
- [ ] 登录错误文案统一、login-check 收敛（FIX-2026-1003，P1）
- [ ] XFF 取值改用 X-Real-IP / 末段（FIX-2026-1004，P2）
- [ ] next 升级 14.2.35、puppeteer-core 25、`npm audit fix`（FIX-2026-1005）

### v1.1 · 体验与可靠性（计划）
- [ ] 限流/验证码存储迁移 Redis（支持横向扩展）
- [ ] 数据库迁移历史规范化（prisma migrate）
- [ ] 导出组件 exceljs 替换 xlsx
- [ ] 移动端（手机浏览器）适配优化
- [ ] 单元测试覆盖核心服务层（出入库/成本/防超卖）

### v1.2 · 生态与扩展（探讨中）
- [ ] 开放 API 完善与 API 文档（OpenAPI 规范）
- [ ] 多租户支持
- [ ] 消息通知（企业微信/钉钉/邮件推送预警）
- [ ] 更丰富的报表（自定义维度、仪表盘配置化）
- [ ] 小程序扫码体验优化（连续扫码、离线暂存）

> 有想法？开一个 Issue，格式参考 `CONTRIBUTING.md` 的需求提案模板。
