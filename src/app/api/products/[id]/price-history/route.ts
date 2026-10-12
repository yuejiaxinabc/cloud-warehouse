import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { serializeBigInt } from '@/lib/serialize';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAuth(req);
  try {
    const productId = parseInt((await params).id);

    // 批次价格
    const lots = await prisma.inventoryLot.findMany({
      where: { productId, status: 1 },
      select: {
        id: true, lotNumber: true, costPrice: true, quantity: true, createdAt: true,
        warehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 入库明细价格
    const inboundItems = await prisma.inboundItem.findMany({
      where: { productId, costPrice: { not: null } },
      select: {
        id: true, costPrice: true, quantity: true, lotNumber: true, createdAt: true,
        order: { select: { orderNo: true, postedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const records: any[] = [];

    lots.forEach((lot) => {
      records.push({
        id: `lot-${lot.id}`,
        type: '批次',
        orderNo: lot.lotNumber,
        price: Number(lot.costPrice || 0),
        qty: Number(lot.quantity || 0),
        date: lot.createdAt,
      });
    });

    inboundItems.forEach((item) => {
      records.push({
        id: `in-${item.id}`,
        type: '入库',
        orderNo: item.order?.orderNo || item.lotNumber || '-',
        price: Number(item.costPrice || 0),
        qty: Number(item.quantity || 0),
        date: item.order?.postedAt || item.createdAt,
      });
    });

    records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 当前成本价
    const inventory = await prisma.inventory.findFirst({
      where: { productId },
      select: { avgCost: true },
    });

    // 最近入库价
    const lastInbound = inboundItems[0];

    return NextResponse.json({
      success: true,
      data: serializeBigInt({
        currentCost: inventory?.avgCost ? Number(inventory.avgCost) : 0,
        lastInboundPrice: lastInbound?.costPrice ? Number(lastInbound.costPrice) : 0,
        records,
      }),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
