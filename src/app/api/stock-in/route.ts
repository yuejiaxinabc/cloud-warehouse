import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { createWithOrderNo } from '@/lib/order-no';
import { handleApiError } from '@/lib/errors';
// H1/F5 修复：数量与单价防线、列表筛选白名单
import { assertPositiveQty, assertNonNegativePrice, assertAmountWithinLimit } from '@/lib/qty-guard';
import { Prisma } from '@prisma/client';
// v1.2.3 数据权限：入库单列表按角色数据范围收敛仓库 + 本人经手

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
    await requirePermission('stock_in:view', auth);
    // v1.2.3 数据权限：先取作用域与当前用户
    const scope = await resolveScope(auth);
    const uid = Number(auth.user.id);
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get("keyword") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "15");

    // F5 修复：type / status / warehouseId / 日期区间此前被路由丢弃，
    // 前端传 type=XXX 仍返回全部数据（看起来像「筛选无效」）
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";
    const warehouseId = Number(searchParams.get("warehouseId") || 0);
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const where: any = {};
    if (keyword) where.orderNo = { contains: keyword };
    if (type) where.type = type.toUpperCase();
    if (status) where.status = status.toUpperCase();
    if (warehouseId > 0) where.warehouseId = warehouseId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + "T23:59:59");
    }

    // v1.2.3 数据权限：先按仓库收敛，SELF 档位再收敛为本人经手；
    // 请求带 warehouseId 时与之取交集，避免越权或筛选被放大
    const scopedWhere: any = withDocumentScope(where, scope, auth.user);

    const [items, total] = await Promise.all([
      prisma.inboundOrder.findMany({
        where: scopedWhere,
        include: { warehouse: true, inboundItems: { include: { product: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
      }),
      // v1.2.3 数据权限：count 与 findMany 必须同一个 where，否则 total 会泄露总条数
      prisma.inboundOrder.count({ where: scopedWhere }),
    ]);

    return NextResponse.json({ success: true, data: serializeBigInt({ items, total, page, pageSize, scope: scopeSummary(scope) }) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('stock_in:create', auth);
    // v1.2.1：写操作按权限闸门拦截（P0-1）。此前只校验「已登录」，auditor 也能建入库单。
    const body = await req.json();
    const { type, warehouseId, items, remark } = body;
    const scope = await getDataScope(auth.user);
    await assertWarehouseAllowed(scope, Number(warehouseId));

    // P1-13：空明细不再放行（原来能建出 RK…0001 这种无法过账的空单）
    if (!type || !warehouseId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "类型、仓库与至少一条入库明细为必填" }, { status: 400 });
    }

    // P1-13 + H1：数量必须 > 0 且有上限；单价不得为负、不得天文数字；
    // 校验抛 AppError，由 handleApiError 统一出 400 文案（不再冒 Prisma 原文）
    let plannedQty = 0;
    let plannedAmount = 0;
    for (let i = 0; i < items.length; i++) {
      const label = "第 " + (i + 1) + " 行";
      const qty = assertPositiveQty(items[i]?.planQty ?? items[i]?.quantity, label + "入库数量");
      const price =
        items[i]?.unitPrice === undefined || items[i]?.unitPrice === null
          ? 0
          : assertNonNegativePrice(items[i].unitPrice, label + "单价");
      plannedQty += qty;
      plannedAmount += qty * price;
    }
    assertAmountWithinLimit(plannedAmount);

    const itemsData = items.map((it: any) => ({
      productId: Number(it.productId),
      // FIX-2026-1013：之前这里把 locationId 丢了，过账时无货位可落
      locationId: it.locationId ? Number(it.locationId) : null,
      quantity: Number(it.planQty || it.quantity),
      costPrice: it.unitPrice ? Number(it.unitPrice) : null,
      lotNumber: it.batchNo || it.lotNumber || null,
      // v1.2.0：有保质期的商品必须录生产日期，到期日由过账逻辑按保质期推算
      producedAt: it.producedAt ? new Date(it.producedAt) : null,
      expiredAt: it.expiredAt ? new Date(it.expiredAt) : null,
    }));

    // P1-11：单号走 order-no 生成器，唯一约束冲突自动换号重试（原 count+1 并发必撞号）
    const order = await createWithOrderNo(prisma, {
      model: "inboundOrder",
      prefix: "RK",
      create: (orderNo) => prisma.inboundOrder.create({
        data: {
          operatorId: Number(auth.user.id),
          orderNo, type: type.toUpperCase(), warehouseId: Number(warehouseId),
          status: "DRAFT", remark: remark || null,
          totalQty: new Prisma.Decimal(plannedQty),
          totalAmount: new Prisma.Decimal(plannedAmount),
          inboundItems: { create: itemsData },
        },
        include: { inboundItems: true },
      }),
    });

    return NextResponse.json({ success: true, data: serializeBigInt(order) });
  } catch (error: any) {
    return handleApiError(error);
  }
}
