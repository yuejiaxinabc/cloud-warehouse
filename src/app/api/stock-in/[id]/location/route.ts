import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AppError, handleApiError } from '@/lib/errors';
import { lockOrderRow } from '@/lib/order-lock';
import { assertDocumentAllowed } from '@/lib/data-scope';
import { businessAccess } from '@/app/api/warehouse/access';
import { positiveId } from '@/app/api/location-stocks/allocate';

/** Draft binding only: never modifies inventory or posted orders. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { scope, user } = await businessAccess('stock_in:create');
    const orderId = positiveId(params.id, '单据ID');
    const body = await req.json();
    if (!Array.isArray(body?.items) || body.items.length === 0 || body.items.length > 200) throw new AppError('请选择 1 到 200 个明细', 400);
    const items = body.items.map((item: any) => ({ itemId: positiveId(item?.itemId, '明细ID'), locationId: positiveId(item?.locationId, '货位ID') }));
    if (new Set(items.map((item: any) => String(item.itemId))).size !== items.length) throw new AppError('明细ID重复', 400);
    const updated = await prisma.$transaction(async tx => {
      if (!await lockOrderRow(tx, 'inbound_orders', orderId)) throw new AppError('入库单不存在', 404);
      const order = await tx.inboundOrder.findUnique({ where: { id: orderId }, include: { inboundItems: true } });
      if (!order) throw new AppError('入库单不存在', 404);
      await assertDocumentAllowed(scope, user, order);
      if (order.status !== 'DRAFT') throw new AppError('只有草稿状态的入库单可以修改货位', 400);
      const assignments = new Map<string, bigint>();
      for (const row of order.inboundItems) {
        const selected = items.find((item: any) => item.itemId === row.id);
        const locationId = selected?.locationId || row.locationId;
        if (!locationId) continue;
        const prior = assignments.get(String(locationId));
        if (prior !== undefined && prior !== row.productId) throw new AppError('同一货位只能分配一种商品', 400);
        assignments.set(String(locationId), row.productId);
      }
      for (const item of items) {
        const row = order.inboundItems.find(row => row.id === item.itemId);
        if (!row) throw new AppError('入库明细不存在或不属于此单据', 400);
        const location = await tx.location.findUnique({ where: { id: item.locationId }, include: { zone: true } });
        if (!location || location.zone.warehouseId !== order.warehouseId || location.status !== 1 || location.zone.status !== 1) throw new AppError('货位不可用或不属于本单仓库', 400);
        const occupied = await tx.locationStock.findFirst({ where: { locationId: item.locationId, productId: { not: row.productId }, quantity: { gt: 0 } } });
        if (occupied) throw new AppError('货位已被其他商品占用', 400);
        await tx.inboundItem.update({ where: { id: item.itemId }, data: { locationId: item.locationId } });
      }
      return items.length;
    }, { isolationLevel: 'ReadCommitted' });
    return NextResponse.json({ success: true, data: { updated } });
  } catch (error) {
    return handleApiError(error);
  }
}
