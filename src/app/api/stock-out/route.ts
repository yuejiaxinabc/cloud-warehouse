import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { generateOrderNo } from '@/lib/utils';
import { requireAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
    await requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // If ID is provided, return single order
    if (id) {
      const order = await prisma.outboundOrder.findUnique({
        where: { id: Number(id) },
        include: {
          warehouse: true,
          customer: true,
          outboundItems: { include: { product: true } },
        },
      });

      if (!order) {
        return NextResponse.json({ success: false, error: '出库单不存在' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: serializeBigInt({ items: [order], total: 1 }) });
    }

    // Otherwise return list
    const where: any = {};
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { recipientName: { contains: keyword } },
        { department: { contains: keyword } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.outboundOrder.findMany({
        where,
        include: {
          warehouse: true,
          customer: true,
          outboundItems: { include: { product: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.outboundOrder.count({ where }),
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
    const { type, warehouseId, customerId, items, remark, useLocation, department, shift, recipientName, deptManager, recipientTime } = body;

    if (!warehouseId || !items || items.length === 0) {
      return NextResponse.json({ success: false, error: '仓库和商品为必填' }, { status: 400 });
    }

    if (!recipientName) {
      return NextResponse.json({ success: false, error: '领用人为必填' }, { status: 400 });
    }

    // Generate order number
    const orderNo = await generateOrderNo('CK', prisma);

    // Calculate total quantity and amount
    let totalQty = 0;
    let totalAmount = 0;
    const itemsData = items.map((item: any) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.costPrice || item.unitPrice || 0);
      totalQty += qty;
      totalAmount += qty * price;
      return {
        productId: Number(item.productId),
        quantity: qty,
        costPrice: price,
        amount: qty * price,
      };
    });

    const order = await prisma.outboundOrder.create({
      data: {
        orderNo,
        type: type || 'OTHER',
        warehouseId: Number(warehouseId),
        customerId: customerId ? Number(customerId) : null,
        status: 'DRAFT',
        totalQty,
        totalAmount,
        remark: remark || null,
        useLocation: useLocation || null,
        department: department || null,
        shift: shift || null,
        recipientName: recipientName || null,
        recipientQty: totalQty,
        deptManager: deptManager || null,
        recipientTime: recipientTime ? new Date(recipientTime) : new Date(),
        outboundItems: {
          create: itemsData,
        },
      },
      include: {
        outboundItems: true,
      },
    });

    return NextResponse.json({ success: true, data: serializeBigInt(order) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
