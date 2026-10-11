# 库存管理系统 (Inventory Management System)

面向中小型制造、零售与贸易企业的全链路库存管理系统。

## 技术栈

- **前端**: Next.js 14 (App Router) + TypeScript + Ant Design 5 + Tailwind CSS
- **后端**: Next.js Route Handlers + Prisma ORM
- **数据库**: MySQL 5.7 (InnoDB / utf8mb4)
- **认证**: NextAuth.js + RBAC
- **图表**: Recharts

## 功能模块

### 核心模块 (8大)
1. **商品/物料管理** - SKU管理、分类体系、规格属性、供应商关联
2. **入库管理** - 采购入库、退货入库、生产入库、其他入库
3. **出库管理** - 销售出库、领料出库、审批流程、防超卖
4. **库存查询** - 实时结存、可用量计算、批次追踪
5. **盘点管理** - 定期盘点、循环盘点、差异调整
6. **仓库库位** - 多仓库、库区、库位管理、移库调拨
7. **预警中心** - 低库存/高库存/临期/呆滞预警
8. **报表统计** - 收发存、周转率、库龄分析

### 扩展模块
- BOM物料清单管理
- 序列号追踪
- 条码标签打印
- 成本核算(移动加权/FIFO/月度加权)
- 通用Excel导出

### 系统设置
- 用户管理 (RBAC)
- 角色权限管理
- 操作日志审计

## 快速开始

### 1. 安装依赖
```bash
cd inventory-system
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，配置数据库连接
```

### 3. 初始化数据库
```bash
# 生成 Prisma Client
npx prisma generate

# 推送 Schema 到数据库
npx prisma db push

# 播种演示数据
npx ts-node prisma/seed.ts
```

### 4. 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:3000

### 预置账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | Admin@123 | 系统管理员 |
| wh_manager | User@123 | 仓库主管 |
| wh_keeper | User@123 | 仓管员 |
| buyer | User@123 | 采购员 |
| sales | User@123 | 销售员 |
| auditor | User@123 | 审计员 |

## 项目结构

```
inventory-system/
├── prisma/
│   ├── schema.prisma    # 数据库 Schema (~40张表)
│   └── seed.ts          # 演示数据种子
├── src/
│   ├── app/
│   │   ├── (dashboard)/ # 仪表盘布局下的所有页面
│   │   │   ├── page.tsx           # 工作台首页
│   │   │   ├── products/          # 商品管理
│   │   │   ├── stock-in/          # 入库管理
│   │   │   ├── stock-out/         # 出库管理
│   │   │   ├── inventory/         # 库存查询
│   │   │   ├── stocktake/         # 盘点管理
│   │   │   ├── transfers/         # 调拨管理
│   │   │   ├── warehouse/         # 仓库管理
│   │   │   ├── alerts/            # 预警中心
│   │   │   ├── reports/           # 报表中心
│   │   │   ├── bom/               # BOM管理
│   │   │   └── settings/          # 系统设置
│   │   ├── api/                   # RESTful API
│   │   └── layout.tsx             # 根布局
│   ├── components/
│   │   ├── layout/      # 布局组件 (Sidebar)
│   │   └── ui/          # 通用UI组件
│   ├── lib/
│   │   ├── prisma.ts    # Prisma 客户端
│   │   ├── auth.ts      # NextAuth 配置
│   │   ├── redis.ts     # Redis 连接
│   │   ├── constants.ts # 常量定义
│   │   ├── utils.ts     # 工具函数
│   │   └── validators.ts # Zod 验证
│   ├── services/        # 业务服务层
│   └── types/           # TypeScript 类型
└── package.json
```

## 设计规范

- 主色: 深蓝 #232F3E + 强调橙 #FF9900
- 语义色: 成功 #2E7D32 / 警告 #ED6C02 / 危险 #D32F2F / 信息 #1976D2
- 表格斑马纹、卡片圆角 8px、8px 基准栅格

## 核心业务逻辑

- **账实一致**: 所有出入库落地为「单据 + 库存变动 + 流水」三件套
- **乐观锁防超卖**: `UPDATE inventory SET on_hand = on_hand - ? WHERE on_hand >= ?`
- **移动加权平均**: 新成本 = (原结存金额 + 本次入库金额) / (原结存量 + 本次入库量)
- **FIFO**: 按批次生产日期/入库日期升序消耗
- **可用量计算**: available = on_hand - locked (锁定 = 已分配未发 + 在途 + 盘点冻结)
