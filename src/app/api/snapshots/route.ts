import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';

/**
 * 库存日结快照（v1.3）
 * GET  /api/snapshots?date=2026-10-28&warehouseId=1   查询某日快照
 * POST /api/snapshots/run  { date?: 'YYYY-MM-DD' }     生成（幂等，可重复跑）
 */
export async function GET(req: NextRequest) {
  await requireAuth(req);
  try {
    const sp = req.nextUrl.searchParams;
    const dateStr = sp.get('date') || new Date().toISOString().slice(0, 10);
    const warehouseId = sp.get('warehouseId');
    const day = new Date(`${dateStr}T00:00:00.000Z`);

    const where: any = { snapshotDate: day };
    if (warehouseId) where.warehouseId = BigInt(warehouseId);

    const [raw, dates] = await Promise.all([
      prisma.inventorySnapshot.findMany({
        where,
        orderBy: { id: 'asc' },
        take: 500,
      }),
      prisma.inventorySnapshot.findMany({
        select: { snapshotDate: true },
        distinct: ['snapshotDate'],
        orderBy: { snapshotDate: 'desc' },
        take: 30,
      }),
    ]);

    // 快照表只存 id，名称在这里补齐（避免给快照表加双向关系）
    const [products, warehouses] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: [...new Set(raw.map((r) => r.productId))] } },
        select: { id: true, code: true, name: true },
      }),
      prisma.warehouse.findMany({
        where: { id: { in: [...new Set(raw.map((r) => r.warehouseId))] } },
        select: { id: true, name: true },
      }),
    ]);
    const pMap = new Map(products.map((p) => [String(p.id), p]));
    const wMap = new Map(warehouses.map((w) => [String(w.id), w]));
    const items = raw.map((r) => ({
      ...r,
      product: pMap.get(String(r.productId)) || null,
      warehouse: wMap.get(String(r.warehouseId)) || null,
    }));

    const totals = items.reduce(
      (acc: any, r: any) => {
        acc.onHand += Number(r.onHand || 0);
        acc.locked += Number(r.locked || 0);
        acc.value += Number(r.onHand || 0) * Number(r.avgCost || 0);
        return acc;
      },
      { onHand: 0, locked: 0, value: 0 }
    );

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        date: dateStr,
        items,
        totals,
        availableDates: dates.map((d: any) => d.snapshotDate.toISOString().slice(0, 10)),
      },
    }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '快照查询失败' }, { status: 500 });
  }
}
