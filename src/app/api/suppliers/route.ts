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
      const supplier = await prisma.supplier.findUnique({ where: { id: Number(id) } });
      if (!supplier) return NextResponse.json({ success: false, error: '供应商不存在' }, { status: 404 });
      return NextResponse.json({ success: true, data: serializeBigInt(supplier) });
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
      prisma.supplier.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.supplier.count({ where }),
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
    const { name, code, contact, phone, email, address, bankAccount, bankName, taxNo, remark } = body;

    if (!name || !code) {
      return NextResponse.json({ success: false, error: '名称和编码为必填' }, { status: 400 });
    }

    const existing = await prisma.supplier.findFirst({ where: { code } });
    if (existing) {
      return NextResponse.json({ success: false, error: '编码已存在' }, { status: 400 });
    }

    const supplier = await prisma.supplier.create({
      data: { name, code, contact, phone, email, address, bankAccount, bankName, taxNo, remark },
    });

    return NextResponse.json({ success: true, data: serializeBigInt(supplier) });
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

    const supplier = await prisma.supplier.update({
      where: { id: Number(id) },
      data,
    });

    return NextResponse.json({ success: true, data: serializeBigInt(supplier) });
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

    const orderCount = await prisma.inboundOrder.count({ where: { supplierId: Number(id) } });
    if (orderCount > 0) {
      return NextResponse.json({ success: false, error: '该供应商有关联入库单，无法删除' }, { status: 400 });
    }

    await prisma.supplier.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
