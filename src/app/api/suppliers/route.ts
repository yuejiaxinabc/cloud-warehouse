import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';

export async function GET(req: NextRequest) {
  try {
    // 读面：任意已登录/持 Token 的客户端可查供应商档案（保持 v1.2.0 行为）
    await requireAuth(req);
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

    const where: any = { deletedAt: null };
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
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // P0-1：供应商建档是写操作（含银行账号），只读角色必须 403
    await requirePermission('supplier:write');
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

    await writeLog({
      module: 'supplier',
      action: 'create',
      ip: getClientIp(),
      content: `新建供应商 ${name}（${code}）`,
      refType: 'supplier',
      refId: supplier.id,
    });

    return NextResponse.json({ success: true, data: serializeBigInt(supplier) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    // P0-1：编辑供应商同样要求写权限
    await requirePermission('supplier:write');
    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const supplier = await prisma.supplier.update({
      where: { id: Number(id) },
      data,
    });

    await writeLog({
      module: 'supplier',
      action: 'update',
      ip: getClientIp(),
      content: `编辑供应商 ${supplier.name}（${supplier.code}）`,
      refType: 'supplier',
      refId: supplier.id,
    });

    return NextResponse.json({ success: true, data: serializeBigInt(supplier) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // P0-1：删除（软删）供应商只给仓库主管及以上
    await requirePermission('supplier:delete');
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const orderCount = await prisma.inboundOrder.count({ where: { supplierId: Number(id) } });
    if (orderCount > 0) {
      return NextResponse.json({ success: false, error: '该供应商有关联入库单，无法删除' }, { status: 400 });
    }

    // v1.2.0 软删除：进回收站，15 天内可恢复
    const deletedSupplier = await prisma.supplier.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } });
    await writeLog({
      module: 'supplier',
      action: 'delete',
      ip: getClientIp(),
      content: `删除供应商 ${deletedSupplier.name}（${deletedSupplier.code}）`,
      refType: 'supplier',
      refId: deletedSupplier.id,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}