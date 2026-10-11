import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

export async function GET() {
  try {
    const units = await prisma.unit.findMany({ orderBy: { id: 'asc' } });
    return NextResponse.json({ success: true, data: serializeBigInt(units) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code } = body;
    if (!name || !code) {
      return NextResponse.json({ success: false, error: '名称和编码为必填' }, { status: 400 });
    }
    const unit = await prisma.unit.create({ data: { name, code } });
    return NextResponse.json({ success: true, data: serializeBigInt(unit) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const productCount = await prisma.product.count({ where: { unitId: Number(id) } });
    if (productCount > 0) {
      return NextResponse.json({ success: false, error: '该单位被商品使用，无法删除' }, { status: 400 });
    }

    await prisma.unit.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
