import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { TransferService } from '@/services/transfer.service';
import { prisma } from '@/lib/prisma';
import { createTransferSchema, paginationSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
// v1.2.3 数据权限：调拨单列表按角色数据范围收敛仓库 + 本人经手

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

/**
 * GET /api/transfers - 调拨单列表
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('transfer:view', auth);

    const { searchParams } = new URL(request.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '20',
    });

    const status = searchParams.get('status') || undefined;
    const fromWhId = searchParams.get('fromWhId') ? Number(searchParams.get('fromWhId')) : undefined;
    const toWhId = searchParams.get('toWhId') ? Number(searchParams.get('toWhId')) : undefined;
    const keyword = searchParams.get('keyword') || undefined;

    // v1.2.3 数据权限：调拨单模型上是 fromWhId / toWhId 两头仓库，没有单一 warehouseId，
    // 所以不走 withWarehouseScope，改成「任一头仓库在作用域内即可见」的 OR 条件；
    // 「仅本人经手」档位再叠一层 operatorId。
    const scope = await resolveScope(auth);
    const uid = Number(auth.user.id);

    const where: any = {};
    if (status) where.status = status;
    if (fromWhId) where.fromWhId = fromWhId;
    if (toWhId) where.toWhId = toWhId;
    if (keyword) where.orderNo = { contains: keyword };
    const scopedWhere = withDocumentScope(where, scope, auth.user, { transfer: true });

    const skip = (pagination.page - 1) * pagination.pageSize;
    const [orders, total] = await Promise.all([
      prisma.transferOrder.findMany({
        where: scopedWhere,
        include: {
          transferItems: {
            include: { product: { select: { id: true, name: true, code: true, unit: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.pageSize,
      }),
      // v1.2.3 数据权限：count 与 findMany 必须同一个 where，否则 total 会泄露总条数
      prisma.transferOrder.count({ where: scopedWhere }),
    ]);

    // 批量填充仓库名称，返回结构与 TransferService.list 保持一致（前端无感）
    const whIds = [...new Set(orders.flatMap((o: any) => [Number(o.fromWhId), Number(o.toWhId)]))];
    const warehouses = whIds.length
      ? await prisma.warehouse.findMany({
          where: { id: { in: whIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const whMap = new Map(warehouses.map((w: any) => [Number(w.id), w]));

    const list = orders.map((o: any) => ({
      ...o,
      id: Number(o.id),
      fromWhId: Number(o.fromWhId),
      toWhId: Number(o.toWhId),
      fromWarehouse: whMap.get(Number(o.fromWhId)) || { id: o.fromWhId, name: '未知仓库', code: '-' },
      toWarehouse: whMap.get(Number(o.toWhId)) || { id: o.toWhId, name: '未知仓库', code: '-' },
      items: o.transferItems.map((item: any) => ({
        ...item,
        id: Number(item.id),
        productId: Number(item.productId),
        quantity: Number(item.quantity),
        sentQty: item.sentQty ? Number(item.sentQty) : null,
        receivedQty: item.receivedQty ? Number(item.receivedQty) : null,
      })),
    }));

    return successResponse({
      list,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.ceil(total / pagination.pageSize),
      scope: scopeSummary(scope),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/transfers - 创建调拨单
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('transfer:create', auth);
    // v1.2.1：调拨属于写操作，按权限闸门拦截（P0-1）

    const body = await request.json();
    const validated = createTransferSchema.parse(body);

    const scope = await getDataScope(auth.user);
    await assertWarehouseAllowed(scope, validated.fromWhId);
    await assertWarehouseAllowed(scope, validated.toWhId);
    const order = await TransferService.create({
      ...validated,
      operatorId: Number(auth.user.id),
    });

    return successResponse(order, '调拨单创建成功');
  } catch (error) {
    return handleApiError(error);
  }
}
