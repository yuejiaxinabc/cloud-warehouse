# 贡献指南（CONTRIBUTING.md）

🎉 **首先，感谢你愿意参与「云仓」的开发与维护！** 无论你是提一个问题、改一个错别字，还是实现一整个新模块，都欢迎。

这是一个面向中小企业的开源库存管理系统（Next.js + Prisma + MySQL），我们希望它能成为中小仓库信息化的**靠谱起点**——而靠谱，靠的是每一位贡献者。

---

## 我可以从哪里开始？

| 你想做的 | 入口 |
|----------|------|
| 报一个 Bug | [提 Issue](#-报-bug) |
| 提一个功能需求 | [需求提案](#-提需求) |
| 修一个安全问题 | 见 `docs/FIXLOG.md` 认领待修复项（**勿公开披露细节**，走 `docs/SECURITY.md` 的披露渠道） |
| 贡献代码 | [开发流程](#-贡献代码流程) |
| 改进文档 | 直接 PR，文档 PR 会被优先 review |
| 帮别人答疑 | 盯一下 Issue 区，回答新手问题也是贡献 |

新手友好的第一个 PR：从 `docs/FIXLOG.md` 里挑一条标了「待修复」的条目（每条都附了修复方案），或者修一个文档错字、补一处 TypeScript 类型。

---

## 🐛 报 Bug

开 Issue 前请先搜索是否已有重复。提交时请包含：

```markdown
**环境**：浏览器/OS、部署方式（本地 dev / Docker / 服务器）
**版本**：commit hash 或版本号
**复现步骤**：1. 打开xx页面 → 2. 点击xx → 3. …（越具体越好）
**期望结果**：应该看到什么
**实际结果**：实际看到什么（附截图/报错日志，注意抹掉敏感信息：token、密码、内网 IP）
```

> ⚠️ 安全漏洞**不要**走公开 Issue，请按 `docs/SECURITY.md` 的披露政策私下报告。

## 💡 提需求

标题格式 `[Feature] 简述`，正文说清：解决什么问题（场景！）、期望效果、你能接受的替代方案。安全或性能相关的需求会进 `docs/CHANGELOG.md` 的路线评估。

## 📝 贡献代码流程

```bash
# 1) Fork + 克隆 + 装依赖（环境搭建详见 docs/DEVELOPMENT.md 第 2 节）
git clone https://github.com/<你的用户名>/inventory-system.git
cd inventory-system && npm install

# 2) 从 main 切功能分支
git checkout -b feat/your-feature   # 或 fix/issue-123

# 3) 开发 & 自测
npm run dev
# 涉及库存逻辑的改动，务必自测：入库→出库→盘点→调拨 全链路 + 并发出库（防超卖）

# 4) 提交（规范见下）并推送
git commit -m "feat(stock-in): 支持批量扫码入库"
git push origin feat/your-feature

# 5) 开 PR，描述改动内容、自测情况、关联 Issue
```

**提交信息规范**：`feat|fix|refactor|docs|chore|test(范围): 描述`
安全相关必须引用 FIXLOG 编号：`fix(security): FIX-2026-1001 移除 middleware 任意 token 放行`

**代码要求**：
- TypeScript 严格类型，`any` 需有注释理由
- 新 API 必须自带鉴权（见 DEVELOPMENT.md 第 4 节）与入参校验
- 涉及库存变动的代码必须遵守「单据+库存+流水」三件套与乐观锁规则（DEVELOPMENT.md 第 5 节）
- 不硬编码密钥；新环境变量要同步更新 `.env.example`

**Review 标准**：我们承诺 7 天内给出首次 review。可能被要求修改，这不是否定你，是让代码一起变得靠谱。

## 🤝 行为准则

- 对事不对人，讨论基于事实与代码。
- 不在 Issue/PR 中粘贴真实的密码、token、生产数据。
- 尊重新手提问，「没有蠢问题」在这里是字面意思。

---

再次欢迎。如果这个项目对你有帮助，一个 Star 就是给维护者最好的鼓励 ⭐
