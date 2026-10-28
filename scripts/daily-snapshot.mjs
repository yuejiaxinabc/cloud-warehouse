#!/usr/bin/env node
/**
 * 库存日结快照（v1.3）
 *
 * 由 cron 每天 00:05 调用：
 *   5 0 * * * /opt/node/bin/node /opt/cloud-warehouse/scripts/daily-snapshot.mjs >> /var/log/cloud-warehouse-snapshot.log 2>&1
 *
 * 幂等：同一天重复执行会先删后建。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();

// 读取项目 .env（不引入 dotenv，减少依赖）
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/^"|"$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function today() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

async function main() {
  const day = today();
  const inventories = await prisma.inventory.findMany({
    select: { productId: true, warehouseId: true, onHand: true, locked: true, available: true, avgCost: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.inventorySnapshot.deleteMany({ where: { snapshotDate: day } });
    for (const inv of inventories) {
      await tx.inventorySnapshot.create({
        data: {
          snapshotDate: day,
          productId: inv.productId,
          warehouseId: inv.warehouseId,
          onHand: inv.onHand,
          locked: inv.locked,
          available: inv.available,
          avgCost: inv.avgCost,
        },
      });
    }
  });

  console.log(`[${new Date().toISOString()}] snapshot ${day.toISOString().slice(0, 10)} written: ${inventories.length}`);
}

main()
  .catch((e) => { console.error('[snapshot] failed:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
