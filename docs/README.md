# 文档索引

| 文档 | 面向 | 内容 |
|---|---|---|
| [云仓用户手册-v1.2.0.pdf](云仓用户手册-v1.2.0.pdf) | 业务用户 | 全模块操作、字段说明、FAQ、附录（27 页） |
| [云仓用户手册-v1.2.0.docx](云仓用户手册-v1.2.0.docx) | 手册维护者 | 可编辑源文件 |
| [CHANGELOG.md](CHANGELOG.md) | 全员 | 版本历史与迭代路线 |
| [ROADMAP-v1.2.md](ROADMAP-v1.2.md) | 产品/实施 | 需求核对与优先级排期 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 运维 | 从零部署（MySQL / Nginx / systemd） |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 开发 | 目录结构、业务规则、编码约定 |
| [SECURITY.md](SECURITY.md) | 运维/安全 | 安全基线与加固清单 |
| [FIXLOG.md](FIXLOG.md) | 开发 | 缺陷修复台账 |
| [UPDATE-2026-10-27.md](UPDATE-2026-10-27.md) | 全员 | v1.0.2 更新说明 |
| [UPDATE-2026-10-28.md](UPDATE-2026-10-28.md) | 全员 | v1.1.1 更新说明 |

## 常用命令

```bash
npm run build            # 生产构建
npm start                # 启动（默认 3000）
npx prisma db push       # 同步 schema
npx prisma studio        # 数据浏览
node scripts/daily-snapshot.mjs   # 手动生成库存日结快照
node scripts/send-report.mjs      # 手动跑一次报表订阅检查
```
