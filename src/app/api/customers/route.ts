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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    if (id) {
      const customer = await prisma.customer.findUnique({ where: { id: Number(id) } });
      if (!customer) return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
      return NextResponse.json({ success: true, data: serializeBigInt(customer) });
    }

    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { contact: { contains: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.customer.count({ where }),
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
    const { name, code, contact, phone, email, address, remark } = body;

    if (!name || !code) {
      return NextResponse.json({ success: false, error: '名称和编码为必填' }, { status: 400 });
    }

    const existing = await prisma.customer.findFirst({ where: { code } });
    if (existing) {
      return NextResponse.json({ success: false, error: '编码已存在' }, { status: 400 });
    }

    const customer = await prisma.customer.create({
      data: { name, code, contact, phone, email, address, remark },
    });

    return NextResponse.json({ success: true, data: serializeBigInt(customer) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
    await requireAuth(req);
  try {
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const customer = await prisma.customer.update({
      where: { id: Number(id) },
      data,
    });

    return NextResponse.json({ success: true, data: serializeBigInt(customer) });
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

    const orderCount = await prisma.outboundOrder.count({ where: { customerId: Number(id) } });
    if (orderCount > 0) {
      return NextResponse.json({ success: false, error: '该客户有关联出库单，无法删除' }, { status: 400 });
    }

    await prisma.customer.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
