import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { createWithOrderNo } from '@/lib/order-no';
import { handleApiError } from '@/lib/errors';
// v1.2.3 数据权限：盘点单列表按角色数据范围收敛仓库 + 本人经手

/**
 * v1.2.3 数据权限：从鉴权结果解析当前用户的数据范围
 * API Token 调用没有角色/组织信息，roles 为空时 getDataScope 会落到最严的「仅本人经手」。
 */
async function resolveScope(auth: Awaited<ReturnType<typeof requireAuth>>): Promise<DataScope> {
  return getDataScope(auth.user);
}

/** v1.2.3 数据权限：返回体里的作用域摘要（warehouseCount = -1 表示不限仓库） */
function scopeSummary(scope: DataScope) {
  return {
    mode: scope.mode,
    label: scope.label,
    warehouseCount: scope.warehouseIds === null ? -1 : scope.warehouseIds.length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('stocktake:view', auth);
    // v1.2.3 数据权限：先取作用域与当前用户
    const scope = await resolveScope(auth);
    const uid = Number(auth.user.id);
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
      // v1.2.3 数据权限：单据仓库不在作用域内直接 403
      await assertDocumentAllowed(scope, auth.user, order);

      return NextResponse.json({ success: true, data: serializeBigInt({ items: [order], total: 1, scope: scopeSummary(scope) }) });
    }

    // Otherwise return list
    const where: any = {};
    if (keyword) where.orderNo = { contains: keyword };
    if (status) where.status = status;

    // v1.2.3 数据权限：先按仓库收敛，SELF 档位再收敛为本人经手
    const scopedWhere: any = withDocumentScope(where, scope, auth.user);

    const [items, total] = await Promise.all([
      prisma.countOrder.findMany({
        where: scopedWhere,
        include: { warehouse: true, countItems: { include: { product: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      // v1.2.3 数据权限：count 与 findMany 必须同一个 where，否则 total 会泄露总条数
      prisma.countOrder.count({ where: scopedWhere }),
    ]);

    return NextResponse.json({ success: true, data: serializeBigInt({ items, total, page, pageSize, scope: scopeSummary(scope) }) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('stocktake:create', auth);
    // v1.2.1：盘点单创建按权限闸门拦截（P0-1）
    const body = await req.json();
    const { type, warehouseId, remark } = body;
    const scope = await getDataScope(auth.user);
    await assertWarehouseAllowed(scope, Number(warehouseId));

    if (!type || !warehouseId) {
      return NextResponse.json({ success: false, error: '类型和仓库为必填' }, { status: 400 });
    }

    // Get inventory items for the warehouse
    const inventories = await prisma.inventory.findMany({
      where: { 
        warehouseId: Number(warehouseId),
        onHand: { gt: 0 }
      },
      include: { product: true },
    });

    const countItemsData = inventories.map(inv => ({
      productId: Number(inv.productId),
      systemQty: Number(inv.onHand),
      countQty: null,
      diffQty: null,
    }));

    // Create order with items
    // P1-11：单号走 order-no 生成器，唯一约束冲突自动换号重试（原 count+1 并发必撞号）
    const order = await createWithOrderNo(prisma, {
      model: 'countOrder',
      prefix: 'PD',
      create: (orderNo) => prisma.countOrder.create({
        data: {
          operatorId: Number(auth.user.id),
          orderNo,
          type: type.toUpperCase(),
          warehouseId: Number(warehouseId),
          status: 'DRAFT',
          remark: remark || null,
          countItems: {
            create: countItemsData,
          },
        },
        include: {
          countItems: { include: { product: true } },
          warehouse: true,
        },
      }),
    });

    return NextResponse.json({ 
      success: true, 
      data: serializeBigInt(order),
      message: '盘点单创建成功，已自动添加 ' + inventories.length + ' 个商品'
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
    // v1.2.1：删除盘点单同样属写操作
  try {
    const auth = await requireAuth(req);
    await requirePermission('stocktake:create', auth);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少ID' }, { status: 400 });

    const order = await prisma.countOrder.findUnique({ where: { id: Number(id) } });
    if (!order) return NextResponse.json({ success: false, error: '盘点单不存在' }, { status: 404 });
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, order);
    if (order.status !== 'DRAFT') return NextResponse.json({ success: false, error: '只能删除草稿状态的盘点单' }, { status: 400 });

    await prisma.countItem.deleteMany({ where: { orderId: Number(id) } });
    await prisma.countOrder.delete({ where: { id: Number(id) } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
