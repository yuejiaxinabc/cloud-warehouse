import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/** POST /api/snapshots/run  —— 生成某日库存快照（幂等） */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const body = await req.json().catch(() => ({}));
    const dateStr = String(body?.date || new Date().toISOString().slice(0, 10));
    const day = new Date(`${dateStr}T00:00:00.000Z`);

    const inventories = await prisma.inventory.findMany({
      select: { productId: true, warehouseId: true, onHand: true, locked: true, available: true, avgCost: true },
    });

    let written = 0;
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
        written += 1;
      }
    });

    await writeLog({
      module: 'inventory',
      action: 'snapshot',
      userId: uid,
      ip: getClientIp(),
      content: `生成 ${dateStr} 库存日结快照，共 ${written} 条`,
      refType: 'snapshot',
    });

    return NextResponse.json({ success: true, data: { date: dateStr, written } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '生成快照失败' }, { status: 500 });
  }
}
