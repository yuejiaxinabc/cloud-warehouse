import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

/**
 * 初始种子（FIX-2026-1013）
 *
 * 按需求：初始数据库只保留「组织 / 权限 / 角色 / 账号密码」，
 * 不预置任何仓库、库区、货位、商品、库存、供应商、客户。
 * 这些业务数据由用户通过页面或 Excel 导入自行建立。
 *
 * 脚本幂等：重复执行不会报错，也不会重复插入。
 */

const prisma = new PrismaClient();

const PERMISSIONS = [
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

const ROLES = [
  { code: "admin", name: "系统管理员" },
  { code: "wh_manager", name: "仓库主管" },
  { code: "wh_keeper", name: "仓管员" },
  { code: "buyer", name: "采购员" },
  { code: "sales", name: "销售员" },
  { code: "auditor", name: "审计员" },
];

// 预置账号（仅账号密码，不含任何业务数据）
const USERS = [
  { username: "admin", realName: "系统管理员", password: "Admin@123", role: "admin" },
  { username: "wh_manager", realName: "张主管", password: "User@123", role: "wh_manager" },
  { username: "wh_keeper", realName: "李仓管", password: "User@123", role: "wh_keeper" },
  { username: "buyer", realName: "王采购", password: "User@123", role: "buyer" },
  { username: "sales", realName: "赵销售", password: "User@123", role: "sales" },
  { username: "auditor", realName: "刘审计", password: "User@123", role: "auditor" },
];

async function main() {
  console.log("开始初始化基础数据（不含任何仓库/商品）...");

  // 1. 组织
  const org = await prisma.organization.upsert({
    where: { code: "ORG001" },
    update: {},
    create: { code: "ORG001", name: "演示公司" },
  });

  // 2. 权限
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });
  }
  const allPerms = await prisma.permission.findMany();

  // 3. 角色
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: r,
    });
  }
  const adminRole = await prisma.role.findUnique({ where: { code: "admin" } });
  if (adminRole) {
    for (const perm of allPerms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: perm.id },
      });
    }
  }

  // 4. 账号
  for (const u of USERS) {
    const password = await hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        realName: u.realName,
        password,
        orgId: org.id,
        status: 1,
      },
    });
    const role = await prisma.role.findUnique({ where: { code: u.role } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }
  }

  console.log("初始化完成。预置账号：");
  for (const u of USERS) console.log(`  ${u.username} / ${u.password}  (${u.role})`);
  console.log("未创建任何仓库、库区、货位、商品、库存 —— 请登录后自行建立或通过 Excel 导入。");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
