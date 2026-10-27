import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { assertLocationInWarehouse } from '@/lib/location-binding';
import { assertLocationAvailableFor } from '@/lib/location-occupancy';

/**
 * POST /api/stock-in/[id]/location
 *
 * 给「草稿」入库单的明细分配货位（FIX-2026-1019）。
 * 原实现只有过账后才能「放置货位」，但过账又要求明细带 locationId，
 * 形成死锁。这里补一条草稿阶段写入 locationId 的通道。
 *
 * body: { items: [{ itemId: string|number, locationId: string|number }] }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth(req);

    const orderId = BigInt(params.id);
    const order = await prisma.inboundOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, warehouseId: true },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: '入库单不存在' }, { status: 404 });
    }
    if (order.status !== 'DRAFT') {
      return NextResponse.json(
        { success: false, error: '只有草稿状态的入库单可以修改货位' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const items: { itemId: any; locationId: any }[] = Array.isArray(body?.items) ? body.items : [];
    const valid = items.filter((i) => i?.itemId && i?.locationId);
    if (!valid.length) {
      return NextResponse.json({ success: false, error: '请至少为一个商品选择货位' }, { status: 400 });
    }

    let updated = 0;
    for (const it of valid) {
      const locationId = BigInt(it.locationId);
      // 货位必须属于本单仓库
      await assertLocationInWarehouse(prisma, locationId, order.warehouseId);

      // 一个货位只能放同一种商品
      const itemRow = await prisma.inboundItem.findFirst({
        where: { id: BigInt(it.itemId), orderId },
        select: { productId: true },
      });
      if (!itemRow) throw new Error('入库明细不存在');
      await assertLocationAvailableFor(prisma, { locationId, productId: itemRow.productId });

      const res = await prisma.inboundItem.updateMany({
        where: { id: BigInt(it.itemId), orderId },
        data: { locationId },
      });
      updated += res.count;
    }

    return NextResponse.json({ success: true, data: { updated } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
