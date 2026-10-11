import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 开始播种演示数据...");

  // 1. 创建组织
  const org = await prisma.organization.create({
    data: { code: "ORG001", name: "演示公司", address: "上海市浦东新区" },
  });

  // 2. 创建权限
  const permissionCodes = [
    "product:view", "product:create", "product:edit", "product:delete",
    "stock_in:view", "stock_in:create", "stock_in:post",
    "stock_out:view", "stock_out:create", "stock_out:approve", "stock_out:post",
    "inventory:view",
    "stocktake:view", "stocktake:create", "stocktake:settle",
    "transfer:view", "transfer:create", "transfer:approve",
    "alert:view", "alert:manage",
    "report:view", "report:export",
    "bom:view", "bom:create", "bom:edit",
    "user:manage", "role:manage", "audit:view",
  ];
  for (const code of permissionCodes) {
    await prisma.permission.create({ data: { code, name: code } });
  }
  const allPerms = await prisma.permission.findMany();

  // 3. 创建角色
  const roles = [
    { code: "admin", name: "系统管理员" },
    { code: "wh_manager", name: "仓库主管" },
    { code: "wh_keeper", name: "仓管员" },
    { code: "buyer", name: "采购员" },
    { code: "sales", name: "销售员" },
    { code: "auditor", name: "审计员" },
  ];
  for (const r of roles) {
    await prisma.role.create({ data: r });
  }
  const adminRole = await prisma.role.findUnique({ where: { code: "admin" } });
  // 管理员拥有所有权限
  for (const perm of allPerms) {
    await prisma.rolePermission.create({ data: { roleId: adminRole!.id, permissionId: perm.id } });
  }

  // 4. 创建用户
  const passwordHash = await hash("Admin@123", 10);
  const userPasswordHash = await hash("User@123", 10);
  const users = [
    { username: "admin", realName: "系统管理员", passwordHash, orgId: org.id },
    { username: "wh_manager", realName: "张主管", passwordHash: userPasswordHash, orgId: org.id },
    { username: "wh_keeper", realName: "李仓管", passwordHash: userPasswordHash, orgId: org.id },
    { username: "buyer", realName: "王采购", passwordHash: userPasswordHash, orgId: org.id },
    { username: "sales", realName: "赵销售", passwordHash: userPasswordHash, orgId: org.id },
    { username: "auditor", realName: "刘审计", passwordHash: userPasswordHash, orgId: org.id },
  ];
  for (const u of users) {
    await prisma.user.create({ data: u });
  }
  const adminUser = await prisma.user.findUnique({ where: { username: "admin" } });
  await prisma.userRole.create({ data: { userId: adminUser!.id, roleId: adminRole!.id } });

  // 5. 创建仓库和库位
  const warehouses = [
    { code: "WH01", name: "华东仓", address: "上海市" },
    { code: "WH02", name: "华南仓", address: "广州市" },
    { code: "WH03", name: "华北仓", address: "北京市" },
  ];
  for (const w of warehouses) {
    await prisma.warehouse.create({ data: { ...w, orgId: org.id } });
  }
  const wh1 = await prisma.warehouse.findUnique({ where: { code: "WH01" } });
  const wh2 = await prisma.warehouse.findUnique({ where: { code: "WH02" } });

  // 库区
  const zones = [
    { warehouseId: wh1!.id, code: "A", name: "A区-电子料" },
    { warehouseId: wh1!.id, code: "B", name: "B区-半成品" },
    { warehouseId: wh1!.id, code: "C", name: "C区-成品" },
  ];
  for (const z of zones) {
    await prisma.zone.create({ data: z });
  }

  // 库位
  const locations = [
    { warehouseId: wh1!.id, code: "A-01-01", type: "storage" },
    { warehouseId: wh1!.id, code: "A-01-02", type: "storage" },
    { warehouseId: wh1!.id, code: "A-02-01", type: "pick" },
    { warehouseId: wh1!.id, code: "B-01-01", type: "storage" },
    { warehouseId: wh1!.id, code: "C-01-01", type: "storage" },
    { warehouseId: wh2!.id, code: "A-01-01", type: "storage" },
  ];
  for (const l of locations) {
    await prisma.location.create({ data: l });
  }

  // 6. 创建分类
  const categories = [
    { code: "ELEC", name: "电子料", level: 1 },
    { code: "SEMI", name: "半成品", level: 1 },
    { code: "FINI", name: "成品", level: 1 },
    { code: "SPAR", name: "备品备件", level: 1 },
  ];
  for (const c of categories) {
    await prisma.category.create({ data: c });
  }

  // 7. 创建供应商和客户
  const suppliers = [
    { code: "SUP001", name: "深圳电子科技", contact: "张三", phone: "13900000001" },
    { code: "SUP002", name: "东莞精密制造", contact: "李四", phone: "13900000002" },
    { code: "SUP003", name: "广州半导体", contact: "王五", phone: "13900000003" },
  ];
  for (const s of suppliers) {
    await prisma.supplier.create({ data: s });
  }

  const customers = [
    { code: "CUS001", name: "上海贸易有限公司", contact: "赵六", phone: "13800000001" },
    { code: "CUS002", name: "北京科技发展公司", contact: "钱七", phone: "13800000002" },
  ];
  for (const c of customers) {
    await prisma.customer.create({ data: c });
  }

  // 8. 创建商品
  const products = [
    { sku: "RM-001", name: "电阻10KΩ", unit: "个", type: "raw", categoryId: (await prisma.category.findFirst({ where: { code: "ELEC" } }))!.id, safetyStock: 100, maxStock: 5000 },
    { sku: "RM-002", name: "电容100μF", unit: "个", type: "raw", categoryId: (await prisma.category.findFirst({ where: { code: "ELEC" } }))!.id, safetyStock: 200, maxStock: 3000 },
    { sku: "RM-003", name: "芯片STM32F103", unit: "片", type: "raw", categoryId: (await prisma.category.findFirst({ where: { code: "ELEC" } }))!.id, safetyStock: 50, maxStock: 1000 },
    { sku: "SF-001", name: "PCB板V2.0", unit: "块", type: "semi", categoryId: (await prisma.category.findFirst({ where: { code: "SEMI" } }))!.id, safetyStock: 100, maxStock: 2000 },
    { sku: "FG-001", name: "智能控制器V1", unit: "台", type: "finished", categoryId: (await prisma.category.findFirst({ where: { code: "FINI" } }))!.id, safetyStock: 20, maxStock: 500 },
    { sku: "SP-001", name: "螺丝M3x10", unit: "个", type: "spare", categoryId: (await prisma.category.findFirst({ where: { code: "SPAR" } }))!.id, safetyStock: 500, maxStock: 10000 },
  ];
  for (const p of products) {
    await prisma.product.create({ data: p });
  }

  // 9. 创建初始库存
  const rm1 = await prisma.product.findUnique({ where: { sku: "RM-001" } });
  const rm2 = await prisma.product.findUnique({ where: { sku: "RM-002" } });
  const rm3 = await prisma.product.findUnique({ where: { sku: "RM-003" } });
  const sf1 = await prisma.product.findUnique({ where: { sku: "SF-001" } });
  const fg1 = await prisma.product.findUnique({ where: { sku: "FG-001" } });
  const sp1 = await prisma.product.findUnique({ where: { sku: "SP-001" } });
  const loc1 = await prisma.location.findFirst({ where: { code: "A-01-01", warehouseId: wh1!.id } });

  const inventoryItems = [
    { productId: rm1!.id, warehouseId: wh1!.id, locationId: loc1!.id, onHand: 3000, avgCost: 0.5 },
    { productId: rm2!.id, warehouseId: wh1!.id, locationId: loc1!.id, onHand: 1500, avgCost: 1.2 },
    { productId: rm3!.id, warehouseId: wh1!.id, locationId: loc1!.id, onHand: 500, avgCost: 50 },
    { productId: sf1!.id, warehouseId: wh1!.id, locationId: loc1!.id, onHand: 200, avgCost: 20 },
    { productId: fg1!.id, warehouseId: wh1!.id, locationId: loc1!.id, onHand: 50, avgCost: 120 },
    { productId: sp1!.id, warehouseId: wh1!.id, locationId: loc1!.id, onHand: 5000, avgCost: 0.05 },
  ];
  for (const inv of inventoryItems) {
    await prisma.inventory.create({ data: inv });
  }

  // 10. 创建批次
  const lotItems = [
    { productId: rm1!.id, warehouseId: wh1!.id, locationId: loc1!.id, batchNo: "B2401", qty: 1500, unitCost: 0.5 },
    { productId: rm1!.id, warehouseId: wh1!.id, locationId: loc1!.id, batchNo: "B2405", qty: 1500, unitCost: 0.5 },
    { productId: rm3!.id, warehouseId: wh1!.id, locationId: loc1!.id, batchNo: "B2310", qty: 200, unitCost: 50, expireDate: new Date("2026-09-15") },
    { productId: rm2!.id, warehouseId: wh1!.id, locationId: loc1!.id, batchNo: "B2401", qty: 1500, unitCost: 1.2, expireDate: new Date("2026-09-01") },
  ];
  for (const lot of lotItems) {
    await prisma.inventoryLot.create({ data: lot });
  }

  console.log("✅ 演示数据播种完成！");
  console.log("📋 预置账号:");
  console.log("   admin / Admin@123 (系统管理员)");
  console.log("   wh_manager / User@123 (仓库主管)");
  console.log("   wh_keeper / User@123 (仓管员)");
  console.log("   buyer / User@123 (采购员)");
  console.log("   sales / User@123 (销售员)");
  console.log("   auditor / User@123 (审计员)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
