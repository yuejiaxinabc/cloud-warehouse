import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/products/[id]/price - 获取商品成本价
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const productId = parseInt((await params).id);

    // 1. 先查 inventory_lots 的最新成本价
    const latestLot = await prisma.inventoryLot.findFirst({
      where: {
        productId,
        status: 1,
        costPrice: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { costPrice: true },
    });

    if (latestLot && latestLot.costPrice) {
      return NextResponse.json({
        success: true,
        data: { price: Number(latestLot.costPrice), source: 'lot' },
      });
    }

    // 2. 查最近的入库单成本价
    const latestInboundItem = await prisma.inboundItem.findFirst({
      where: {
        productId,
        costPrice: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { costPrice: true },
    });

    if (latestInboundItem && latestInboundItem.costPrice) {
      return NextResponse.json({
        success: true,
        data: { price: Number(latestInboundItem.costPrice), source: 'inbound' },
      });
    }

    // 3. 查最近的出库单成本价
    const latestOutboundItem = await prisma.outboundItem.findFirst({
      where: {
        productId,
        costPrice: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { costPrice: true },
    });

    if (latestOutboundItem && latestOutboundItem.costPrice) {
      return NextResponse.json({
        success: true,
        data: { price: Number(latestOutboundItem.costPrice), source: 'outbound' },
      });
    }

    return NextResponse.json({
      success: true,
      data: { price: 0, source: 'none' },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
