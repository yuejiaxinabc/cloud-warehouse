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
    const units = await prisma.unit.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } });
    return NextResponse.json({ success: true, data: serializeBigInt(units) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await businessAccess('product:edit');
    const uid = user.id;
    const body = await req.json();
    const { name, code } = body;
    if (!name || !code) {
      return NextResponse.json({ success: false, error: '名称和编码为必填' }, { status: 400 });
    }
    const dup = await prisma.unit.findFirst({ where: { OR: [{ code }, { name }] } });
    if (dup) {
      return NextResponse.json(
        { success: false, error: dup.code === code ? `单位编码「${code}」已存在` : `单位「${name}」已存在` },
        { status: 409 }
      );
    }
    const unit = await prisma.unit.create({ data: { name, code } });
    await writeLog({
      module: 'unit',
      action: 'create',
      userId: uid,
      ip: getClientIp(),
      content: `新建计量单位 ${name}（${code}）`,
      refType: 'unit',
      refId: unit.id,
    });
    return NextResponse.json({ success: true, data: serializeBigInt(unit) });
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

    const productCount = await prisma.product.count({ where: { unitId: Number(id) } });
    if (productCount > 0) {
      return NextResponse.json({ success: false, error: '该单位被商品使用，无法删除' }, { status: 400 });
    }

    // v1.2.0 软删除
    const deleted = await prisma.unit.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } });
    await writeLog({
      module: 'unit',
      action: 'delete',
      userId: user.id,
      ip: getClientIp(),
      content: `删除计量单位 ${deleted.name}（${deleted.code}）`,
      refType: 'unit',
      refId: deleted.id,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
