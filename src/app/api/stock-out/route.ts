import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { createWithOrderNo } from '@/lib/order-no';
import { handleApiError } from '@/lib/errors';
// H1/F5 修复：数量与单价防线、列表筛选
import { assertPositiveQty, assertNonNegativePrice, assertAmountWithinLimit } from '@/lib/qty-guard';
// v1.2.3 数据权限：出库单列表按角色数据范围收敛仓库 + 本人经手

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
    await requirePermission('stock_out:view', auth);
    // v1.2.3 数据权限：先取作用域与当前用户
    const scope = await resolveScope(auth);
    const uid = Number(auth.user.id);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    // If ID is provided, return single order
    if (id) {
      const order = await prisma.outboundOrder.findUnique({
        where: { id: Number(id) },
        include: {
          warehouse: true,
          customer: true,
          outboundItems: { include: { product: true } },
        },
      });

      if (!order) {
        return NextResponse.json({ success: false, error: '出库单不存在' }, { status: 404 });
      }
      // v1.2.3 数据权限：单据仓库不在作用域内直接 403
      await assertDocumentAllowed(scope, auth.user, order);

      return NextResponse.json({ success: true, data: serializeBigInt({ items: [order], total: 1, scope: scopeSummary(scope) }) });
    }

    // Otherwise return list
    // F5 修复：type 之前完全没被读取，前端筛选 type=RETURN 仍返回全部
    const type = searchParams.get('type') || '';
    const warehouseId = Number(searchParams.get('warehouseId') || 0);
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const where: any = {};
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { recipientName: { contains: keyword } },
        { department: { contains: keyword } },
      ];
    }
    if (status) where.status = status.toUpperCase();
    if (type) where.type = type.toUpperCase();
    if (warehouseId > 0) where.warehouseId = warehouseId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    // v1.2.3 数据权限：先按仓库收敛，SELF 档位再收敛为本人经手；
    // 请求带 warehouseId 时与之取交集，避免越权或筛选被放大
    const scopedWhere: any = withDocumentScope(where, scope, auth.user);

    const [items, total] = await Promise.all([
      prisma.outboundOrder.findMany({
        where: scopedWhere,
        include: {
          warehouse: true,
          customer: true,
          outboundItems: { include: { product: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      // v1.2.3 数据权限：count 与 findMany 必须同一个 where，否则 total 会泄露总条数
      prisma.outboundOrder.count({ where: scopedWhere }),
    ]);

    return NextResponse.json({ success: true, data: serializeBigInt({ items, total, page, pageSize, scope: scopeSummary(scope) }) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('stock_out:create', auth);
    // v1.2.1：写操作按权限闸门拦截（P0-1）
    const body = await req.json();
    const { type, warehouseId, customerId, items, remark, useLocation, department, shift, recipientName, deptManager, recipientTime } = body;
    const scope = await getDataScope(auth.user);
    await assertWarehouseAllowed(scope, Number(warehouseId));

    if (!warehouseId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: '仓库和商品为必填' }, { status: 400 });
    }

    if (!recipientName) {
      return NextResponse.json({ success: false, error: '领用人为必填' }, { status: 400 });
    }

    // P1-13：建单前预检数量与可用量。原来负数量能凭空加库存、999999 件也能建单
    // H1：数量 > 0 且有上限；单价不得为负（负单价会让出库金额为负、成本表被污染）
    const requestedByProduct = new Map<number, number>();
    let plannedAmount = 0;
    for (let i = 0; i < items.length; i++) {
      const label = '第 ' + (i + 1) + ' 行';
      const qty = assertPositiveQty(items[i]?.quantity, label + '出库数量');
      const price =
        items[i]?.costPrice === undefined && items[i]?.unitPrice === undefined
          ? 0
          : assertNonNegativePrice(
              items[i]?.costPrice ?? items[i]?.unitPrice ?? 0,
              label + '单价'
            );
      plannedAmount += qty * price;
      const pid = Number(items[i].productId);
      requestedByProduct.set(pid, (requestedByProduct.get(pid) || 0) + qty);
    }
    assertAmountWithinLimit(plannedAmount);

    // 同一商品多行时按合计校验可用量（available = onHand - locked）
    for (const [pid, needQty] of Array.from(requestedByProduct.entries())) {
      const rows = await prisma.inventory.findMany({
        where: { productId: pid, warehouseId: Number(warehouseId) },
        select: { onHand: true, locked: true },
      });
      const avail = rows.reduce(
        (sum, r) => sum + Number(r.onHand || 0) - Number(r.locked || 0),
        0
      );
      if (avail < needQty) {
        return NextResponse.json(
          { success: false, error: '商品(' + pid + ') 可用库存不足：可用 ' + avail + '，本单 ' + needQty },
          { status: 400 }
        );
      }
    }

    // Calculate total quantity and amount
    let totalQty = 0;
    let totalAmount = 0;
    const itemsData = items.map((item: any) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.costPrice || item.unitPrice || 0);
      totalQty += qty;
      totalAmount += qty * price;
      return {
        productId: Number(item.productId),
        quantity: qty,
        costPrice: price,
        amount: qty * price,
      };
    });

    // P1-11：单号走 order-no 生成器，唯一约束冲突自动换号重试
    const order = await createWithOrderNo(prisma, {
      model: 'outboundOrder',
      prefix: 'CK',
      create: (orderNo) => prisma.outboundOrder.create({
        data: {
          operatorId: Number(auth.user.id),
          orderNo,
          type: type || 'OTHER',
          warehouseId: Number(warehouseId),
          customerId: customerId ? Number(customerId) : null,
          status: 'DRAFT',
          totalQty,
          totalAmount,
          remark: remark || null,
          useLocation: useLocation || null,
          department: department || null,
          shift: shift || null,
          recipientName: recipientName || null,
          recipientQty: totalQty,
          deptManager: deptManager || null,
          recipientTime: recipientTime ? new Date(recipientTime) : new Date(),
          outboundItems: {
            create: itemsData,
          },
        },
        include: {
          outboundItems: true,
        },
      }),
    });

    return NextResponse.json({ success: true, data: serializeBigInt(order) });
  } catch (error: any) {
    return handleApiError(error);
  }
}
