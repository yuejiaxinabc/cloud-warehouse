import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = Number((await params).id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const session = await getServerSession(authOptions);
    const userId = session?.user ? Number((session.user as any).id) : null;

    const order = await prisma.outboundOrder.findUnique({
      where: { id },
      include: { outboundItems: true },
    });

    if (!order) return NextResponse.json({ success: false, error: '出库单不存在' }, { status: 404 });
    if (order.status !== 'DRAFT') return NextResponse.json({ success: false, error: '只有草稿状态才能过账' }, { status: 400 });

    for (const item of order.outboundItems) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);
      const warehouseId = Number(order.warehouseId);

      const inventory = await prisma.inventory.findFirst({ where: { productId, warehouseId } });
      if (!inventory || Number(inventory.onHand) < quantity) {
        return NextResponse.json({ success: false, error: `商品ID=${productId}库存不足` }, { status: 400 });
      }

      const beforeQty = Number(inventory.onHand);
      const afterQty = beforeQty - quantity;
      const lockedQty = Number(inventory.locked || 0);

      await prisma.inventory.update({
        where: { id: inventory.id },
        data: { onHand: afterQty, available: afterQty - lockedQty },
      });

      // 更新货位库存（按FIFO从最早入库的货位扣减）
      let remainQty = quantity;
      const locStocks = await prisma.locationStock.findMany({
        where: { inventoryId: inventory.id, productId, warehouseId },
        orderBy: { createdAt: 'asc' },
      });
      for (const ls of locStocks) {
        if (remainQty <= 0) break;
        const lsQty = Number(ls.quantity);
        const deduct = Math.min(remainQty, lsQty);
        await prisma.locationStock.update({
          where: { id: ls.id },
          data: { quantity: lsQty - deduct },
        });
        remainQty -= deduct;
      }
      // 清理数量为0的记录
      await prisma.locationStock.deleteMany({ where: { inventoryId: inventory.id, quantity: { lte: 0 } } });

      await prisma.inventoryTransaction.create({
        data: {
          txnType: 'OUTBOUND', refType: 'OUTBOUND', refId: order.id, refNo: order.orderNo,
          productId, warehouseId, quantity: -quantity,
          costPrice: item.costPrice ? Number(item.costPrice) : null,
          beforeQty, afterQty, remark: `IP: ${ip}`,
        },
      });
    }

    // 操作日志
    await prisma.operationLog.create({
      data: {
        userId, module: 'OUTBOUND', action: 'POST', refType: 'OUTBOUND', refId: order.id,
        content: `出库单 ${order.orderNo} 已过账，扣减库存`, ip,
      },
    });

    const updatedOrder = await prisma.outboundOrder.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: { outboundItems: true, warehouse: true },
    });

    return NextResponse.json({ success: true, data: serializeBigInt(updatedOrder), message: '出库单已过账' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
