#!/usr/bin/env node
/**
 * v1.2.3：组织祖先链与层级回填
 *
 * prisma db push 只会加列，不会算历史数据的 ancestors / level。
 * 这个脚本从根往下一次性重算，幂等，可重复执行。
 *
 * 用法：node scripts/backfill-org-scope.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const all = await prisma.organization.findMany({
    select: { id: true, name: true, parentId: true },
    orderBy: { id: 'asc' },
  });
  const byId = new Map(all.map((o) => [Number(o.id), o]));
  const childrenOf = new Map();
  for (const o of all) {
    const pid = o.parentId ? Number(o.parentId) : null;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid).push(Number(o.id));
  }

  let updated = 0;
  const walk = async (id, chain, level) => {
    const row = byId.get(id);
    if (!row) return;
    await prisma.organization.update({
      where: { id: BigInt(id) },
      data: { ancestors: chain, level },
    });
    updated += 1;
    const nextChain = chain + id + ',';
    for (const child of childrenOf.get(id) || []) {
      await walk(child, nextChain, level + 1);
    }
  };

  const roots = childrenOf.get(null) || [];
  for (const root of roots) {
    await walk(root, '', 1);
  }

  // 兜底：父节点丢失的孤儿组织挂到根
  const orphan = all.filter((o) => o.parentId && !byId.has(Number(o.parentId)));
  for (const o of orphan) {
    await prisma.organization.update({ where: { id: o.id }, data: { parentId: null, ancestors: '', level: 1 } });
    console.log('[warn] 组织', o.name, '上级丢失，已挂到根');
  }

  console.log('[ok] 组织祖先链回填完成，共更新', updated, '条');
}

main()
  .catch((e) => { console.error('[err] 回填失败：', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });