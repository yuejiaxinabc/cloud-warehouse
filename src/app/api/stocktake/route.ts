import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
    await requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '15');

    // If ID is provided, return single order
    if (id) {
      const order = await prisma.countOrder.findUnique({
        where: { id: Number(id) },
        include: { 
          warehouse: true, 
          countItems: { include: { product: true } } 
        },
      });

      if (!order) {
        return NextResponse.json({ success: false, error: '盘点单不存在' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: serializeBigInt({ items: [order], total: 1 }) });
    }

    // Otherwise return list
    const where: any = {};
    if (keyword) where.orderNo = { contains: keyword };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.countOrder.findMany({
        where,
        include: { warehouse: true, countItems: { include: { product: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.countOrder.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: serializeBigInt({ items, total, page, pageSize }) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
    await requireAuth(req);
  try {
    const body = await req.json();
    const { type, warehouseId, remark } = body;

    if (!type || !warehouseId) {
      return NextResponse.json({ success: false, error: '类型和仓库为必填' }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const count = await prisma.countOrder.count({
      where: { orderNo: { startsWith: 'PD' + dateStr } },
    });
    const orderNo = 'PD' + dateStr + '-' + String(count + 1).padStart(4, '0');

    // Get inventory items for the warehouse
    const inventories = await prisma.inventory.findMany({
      where: { 
        warehouseId: Number(warehouseId),
        onHand: { gt: 0 }
      },
      include: { product: true },
    });

    // Create order with items
    const order = await prisma.countOrder.create({
      data: {
        orderNo,
        type: type.toUpperCase(),
        warehouseId: Number(warehouseId),
        status: 'DRAFT',
        remark: remark || null,
        countItems: {
          create: inventories.map(inv => ({
            productId: Number(inv.productId),
            systemQty: Number(inv.onHand),
            countQty: null,
            diffQty: null,
          })),
        },
      },
      include: {
        countItems: { include: { product: true } },
        warehouse: true,
      },
    });

    return NextResponse.json({ 
      success: true, 
      data: serializeBigInt(order),
      message: '盘点单创建成功，已自动添加 ' + inventories.length + ' 个商品'
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
    await requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const order = await prisma.countOrder.findUnique({ where: { id: Number(id) } });
    if (!order) return NextResponse.json({ success: false, error: '盘点单不存在' }, { status: 404 });
    if (order.status !== 'DRAFT') return NextResponse.json({ success: false, error: '只能删除草稿状态的盘点单' }, { status: 400 });

    await prisma.countItem.deleteMany({ where: { orderId: Number(id) } });
    await prisma.countOrder.delete({ where: { id: Number(id) } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
