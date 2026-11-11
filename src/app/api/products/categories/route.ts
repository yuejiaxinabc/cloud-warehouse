import { businessAccess } from '@/app/api/warehouse/access';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp } from '@/lib/log';
import { requireAuth } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

export async function GET() {
  try {
    await businessAccess('product:view');
    const categories = await prisma.category.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } });
    return NextResponse.json({ success: true, data: serializeBigInt(categories) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await businessAccess('product:edit');
    const uid = user.id;
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
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await businessAccess('product:delete');
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

    // v1.2.0 软删除
    const deleted = await prisma.category.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } });
    await writeLog({
      module: 'category',
      action: 'delete',
      userId: user.id,
      ip: getClientIp(),
      content: `删除商品分类 ${deleted.name}（${deleted.code}）`,
      refType: 'category',
      refId: deleted.id,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
