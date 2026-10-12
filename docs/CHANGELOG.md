# 迭代记录与路线（CHANGELOG.md）

> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：`主版本.次版本.修订号`。
> 功能迭代记录在「版本历史」；后续方向在「迭代路线」。欢迎在 Issue 中提出需求 → 可能进入下一版本路线。

---

## 版本历史

### v1.1.0（2026-10-12 · 技术栈升级 + 体验与可靠性）

> 本次升级已部署上线（`warehouse.yuejiaxin.ln.cn`，Next 15.5.27 / React 19）。

- ✅ **UPG-2026-1101** 技术栈升级：Next.js `14.2.35 → 15.5.x`、React/React-DOM `18 → 19`；引入 `@ant-design/v5-patch-for-react-19` 兼容 antd v5；next-auth `→ 4.24.15`（安装需 `--legacy-peer-deps`）
- ✅ **UPG-2026-1102** Next 15 破坏性适配：动态路由 `params` 与 `headers()`/`cookies()` 改为异步 `await`（22 个 API 路由、3 处 `headers()`、7 处客户端 IP 调用）
- ✅ **FEAT-2026-1103** 新增前端「数据备份」页面 `/settings/backup`：备份列表（单选日期）、哈希链完整性报告、立即备份、回滚到所选备份（Popconfirm 强确认 + 回滚前自动快照）；侧边栏新增「数据备份」入口
- ✅ **FEAT-2026-1104** 新增备份 / 回滚桥接 API（`GET/POST /api/admin/backup`、`POST /api/admin/backup/restore`，`requireAdmin` 鉴权 + `execFile` 参数化防命令注入）
- ✅ **FIX-2026-1105（P0）** 数据导出修复：盘点记录（引用已重命名模型 `stocktakeOrder` → 改用 `countOrder`，消除 500）；调拨 / 库存流水（去除 schema 中已不存在的关系 `include`，改用外键 Map 映射，消除 400）
- ✅ **FIX-2026-1106** nginx 旧 `/admin-backup` 坏路由（307→/login 连环跳转）改为 `301` 重定向至 `/settings/backup`
- ✅ **OPS-2026-1107** 部署前快照机制：大版本部署前生成 `/var/backups/pre-deploy-*.tar.gz`，可回滚
- 🔶 `next.config.js` 仍 `ignoreBuildErrors: true`（缺陷 1 此前被其掩盖，建议后续收紧以提前暴露 schema 漂移类问题）
- ℹ️ 1.1.0 代码改动截至文档日**尚未 git commit / push**，工作树相对 `main` 为 dirty

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
