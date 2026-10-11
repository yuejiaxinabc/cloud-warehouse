import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } });
    return NextResponse.json({ success: true, data: serializeBigInt(categories) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, code, parentId } = body;
    if (!name || !code) {
      return NextResponse.json({ success: false, error: '名称和编码为必填' }, { status: 400 });
    }
    const category = await prisma.category.create({
      data: { name, code, parentId: parentId ? Number(parentId) : null },
    });
    return NextResponse.json({ success: true, data: serializeBigInt(category) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const productCount = await prisma.product.count({ where: { categoryId: Number(id) } });
    if (productCount > 0) {
      return NextResponse.json({ success: false, error: '该分类下有商品，无法删除' }, { status: 400 });
    }

    const childCount = await prisma.category.count({ where: { parentId: Number(id) } });
    if (childCount > 0) {
      return NextResponse.json({ success: false, error: '该分类下有子分类，无法删除' }, { status: 400 });
    }

    await prisma.category.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
