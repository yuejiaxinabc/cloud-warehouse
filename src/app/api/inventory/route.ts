import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { handleApiError } from "@/lib/errors";
import { calcAvailableNumber } from "@/lib/utils";
// v1.2.3 数据权限：库存查询按角色数据范围收敛仓库

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
    await requirePermission('inventory:view', auth);
    // v1.2.3 数据权限：先取会话再解析作用域
      const scope = await resolveScope(auth);
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get("keyword") || "";
    const warehouseId = searchParams.get("warehouseId") || "";
    const productId = searchParams.get("productId") || "";
    const detailId = searchParams.get("id") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const alertStatusRaw = searchParams.get("alertStatus") || "";
    const minStock = searchParams.get("minStock") || "";
    const maxStock = searchParams.get("maxStock") || "";
    const batchNumber = searchParams.get("batchNumber") || "";
    const expiryBefore = searchParams.get("expiryBefore") || "";
    const expiryAfter = searchParams.get("expiryAfter") || "";
    const locationId = searchParams.get("locationId") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
    const skip = (page - 1) * pageSize;

    // ===== 详情模式 =====
    if (detailId) {
      const inventory = await prisma.inventory.findUnique({
        where: { id: Number(detailId) },
        include: {
          product: { include: { category: true, unit: true } },
          warehouse: true,
          locationStocks: {
            include: { location: true, box: true },
            orderBy: { id: "asc" },
          },
        },
      });
      if (!inventory) {
        return NextResponse.json({ success: false, error: "库存记录不存在" }, { status: 404 });
      }
      // v1.2.3 数据权限：详情必须落在本人可见的仓库内，否则 403
      await assertWarehouseAllowed(scope, Number(inventory.warehouseId));

      const lots = await prisma.inventoryLot.findMany({
        where: { productId: inventory.productId, warehouseId: inventory.warehouseId },
        orderBy: { id: "desc" },
      });

      return NextResponse.json({
        success: true,
        data: serializeBigInt({
          // v1.2.4 B：可用量 = max(0, 在手 - 锁定)；历史遗留的负 available
          // 在展示侧同样夹到 0（写库侧由 recalcAvailable 保证）。
          inventory: { ...inventory, available: calcAvailableNumber(inventory.onHand, inventory.locked), locationStocks: undefined },
          locationStocks: inventory.locationStocks.map((ls: any) => ({
            id: ls.id,
            locationCode: ls.box?.code || ls.location?.code || "-",
            locationName: ls.box?.code || ls.location?.name || ls.location?.code || "-",
            zoneCode: ls.location?.zone?.code || null,
            lotNumber: ls.lotNumber,
            quantity: Number(ls.quantity || 0),
          })),
          lots: lots.map((l: any) => ({
            id: l.id,
            lotNumber: l.lotNumber,
            quantity: Number(l.quantity || 0),
            costPrice: l.costPrice ? Number(l.costPrice) : null,
            status: l.status,
            producedAt: l.producedAt,
            expiredAt: l.expiredAt,
            createdAt: l.createdAt,
          })),
          scope: scopeSummary(scope),
        }),
      });
    }

    // ===== 列表模式 =====
    const where: any = {};
    if (keyword) {
      where.OR = [
        { product: { name: { contains: keyword } } },
        { product: { code: { contains: keyword } } },
        { product: { barcode: { contains: keyword } } },
      ];
    }
    if (warehouseId) where.warehouseId = Number(warehouseId);
    if (productId) where.productId = Number(productId);
    if (categoryId) where.product = { ...where.product, categoryId: Number(categoryId) };
    if (locationId) where.locationStocks = { some: { locationId: Number(locationId) } };
    if (batchNumber) where.locationStocks = { ...where.locationStocks, some: { lotNumber: { contains: batchNumber } } };
    if (expiryBefore) where.locationStocks = { ...where.locationStocks, some: { lot: { expiredAt: { lte: new Date(expiryBefore) } } } };
    if (expiryAfter) where.locationStocks = { ...where.locationStocks, some: { lot: { expiredAt: { gte: new Date(expiryAfter) } } } };

    // v1.2.3 数据权限：仓库范围收敛；请求带 warehouseId 时与之取交集，避免越权或筛选被放大
    const scopedWhere: any = withWarehouseScope(where, scope);
    if (warehouseId && scope.warehouseIds !== null) {
      const reqWhId = Number(warehouseId);
      scopedWhere.warehouseId = { in: scope.warehouseIds.includes(reqWhId) ? [reqWhId] : [-1] };
    }

    // 1. 批量查询库存 + 商品 + 仓库 + locationStock 数量
    const [items, total] = await Promise.all([
      prisma.inventory.findMany({
        where: scopedWhere,
        include: {
          product: true,
          warehouse: true,
          locationStocks: { select: { id: true } },
        },
        skip,
        take: pageSize,
        orderBy: { id: "desc" },
      }),
      // v1.2.3 数据权限：count 与 findMany 必须同一个 where，否则 total 会泄露总条数
      prisma.inventory.count({ where: scopedWhere }),
    ]);

    if (items.length === 0) {
      return NextResponse.json({ success: true, data: serializeBigInt({ items: [], total, page, pageSize, scope: scopeSummary(scope) }) });
    }

    // 2. 批量查询所有相关批次（避免 N+1）
    const productWarehousePairs = items.map((inv: any) => ({
      productId: inv.productId,
      warehouseId: inv.warehouseId,
    }));

    const allLots = await prisma.inventoryLot.findMany({
      where: {
        OR: productWarehousePairs.map((p: any) => ({
          productId: p.productId,
          warehouseId: p.warehouseId,
        })),
      },
      select: { id: true, productId: true, warehouseId: true, lotNumber: true, quantity: true, expiredAt: true },
      orderBy: { id: "desc" },
    });

    // 按 product+warehouse 分组批次
    const lotsMap = new Map<string, any[]>();
    for (const lot of allLots) {
      const key = `${lot.productId}-${lot.warehouseId}`;
      if (!lotsMap.has(key)) lotsMap.set(key, []);
      lotsMap.get(key)!.push(lot);
    }

    // 3. 组装结果 + 计算预警状态
    const now = new Date();
    const alertDays = 7;
    const alertDate = new Date(now.getTime() + alertDays * 24 * 60 * 60 * 1000);

    const enriched = items.map((inv: any) => {
      const key = `${inv.productId}-${inv.warehouseId}`;
      const lots = (lotsMap.get(key) || []).slice(0, 20);

      const maxExpiredAt = lots.reduce((max: Date | null, l: any) => {
        if (!l.expiredAt) return max;
        const d = new Date(l.expiredAt);
        return !max || d > max ? d : max;
      }, null as Date | null);

      let alertStatus: string = "normal";
      if (maxExpiredAt && maxExpiredAt <= now) alertStatus = "expired";
      else if (maxExpiredAt && maxExpiredAt <= alertDate) alertStatus = "near_expiry";
      else if (Number(inv.onHand) <= Number(inv.product?.safetyStock || 0)) alertStatus = "low";

      return {
        ...inv,
        // v1.2.4 B：同上，展示侧可用量不为负
        available: calcAvailableNumber(inv.onHand, inv.locked),
        locationStocks: undefined,
        locationCount: inv.locationStocks?.length || 0,
        lots,
        alertStatus,
      };
    });

    // 应用层过滤
    const alertStatuses = alertStatusRaw ? alertStatusRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const filtered = alertStatuses.length > 0
      ? enriched.filter((inv: any) => alertStatuses.includes(inv.alertStatus))
      : enriched;

    const byMin = minStock ? filtered.filter((inv: any) => Number(inv.onHand) >= Number(minStock)) : filtered;
    const byMax = maxStock ? byMin.filter((inv: any) => Number(inv.onHand) <= Number(maxStock)) : byMin;

    return NextResponse.json({ success: true, data: serializeBigInt({ items: byMax, total, page, pageSize, scope: scopeSummary(scope) }) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('inventory:delete', auth);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "缺少ID" }, { status: 400 });

    const inventory = await prisma.inventory.findUnique({ where: { id: Number(id) } });
    if (!inventory) return NextResponse.json({ success: false, error: "库存记录不存在" }, { status: 404 });
    await assertWarehouseAllowed(await getDataScope(auth.user), inventory.warehouseId);
    if (Number(inventory.locked) > 0) {
      return NextResponse.json({ success: false, error: "该库存有锁定量，无法删除" }, { status: 400 });
    }

    await prisma.inventory.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
