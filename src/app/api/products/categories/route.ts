import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp } from '@/lib/log';
import { requireAuth } from '@/lib/auth-guard';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({ orderBy: { id: 'asc' } });
    return NextResponse.json({ success: true, data: serializeBigInt(categories) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const body = await req.json();
    const { name, code, parentId } = body;
    if (!name || !code) {
      return NextResponse.json({ success: false, error: '名称和编码为必填' }, { status: 400 });
    }
    const dup = await prisma.category.findFirst({ where: { OR: [{ code }, { name }] } });
    if (dup) {
      return NextResponse.json(
        { success: false, error: dup.code === code ? `分类编码「${code}」已存在` : `分类「${name}」已存在` },
        { status: 409 }
      );
    }
    const category = await prisma.category.create({
      data: { name, code, parentId: parentId ? Number(parentId) : null },
    });
    await writeLog({
      module: 'category',
      action: 'create',
      userId: uid,
      ip: getClientIp(),
      content: `新建商品分类 ${name}（${code}）`,
      refType: 'category',
      refId: category.id,
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

    const deleted = await prisma.category.delete({ where: { id: Number(id) } });
    await writeLog({
      module: 'category',
      action: 'delete',
      ip: getClientIp(),
      content: `删除商品分类 ${deleted.name}（${deleted.code}）`,
      refType: 'category',
      refId: deleted.id,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
