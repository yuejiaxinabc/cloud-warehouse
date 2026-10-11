import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
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

      const lots = await prisma.inventoryLot.findMany({
        where: { productId: inventory.productId, warehouseId: inventory.warehouseId },
        orderBy: { id: "desc" },
      });

      return NextResponse.json({
        success: true,
        data: serializeBigInt({
          inventory: { ...inventory, locationStocks: undefined },
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

    // 1. 批量查询库存 + 商品 + 仓库 + locationStock 数量
    const [items, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          product: true,
          warehouse: true,
          locationStocks: { select: { id: true } },
        },
        skip,
        take: pageSize,
        orderBy: { id: "desc" },
      }),
      prisma.inventory.count({ where }),
    ]);

    if (items.length === 0) {
      return NextResponse.json({ success: true, data: serializeBigInt({ items: [], total, page, pageSize }) });
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

    return NextResponse.json({ success: true, data: serializeBigInt({ items: byMax, total, page, pageSize }) });
  } catch (error: any) {
    console.error("[Inventory API] Error:", error);
    return NextResponse.json({ success: false, error: "服务器内部错误" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "缺少ID" }, { status: 400 });

    const inventory = await prisma.inventory.findUnique({ where: { id: Number(id) } });
    if (!inventory) return NextResponse.json({ success: false, error: "库存记录不存在" }, { status: 404 });
    if (Number(inventory.locked) > 0) {
      return NextResponse.json({ success: false, error: "该库存有锁定量，无法删除" }, { status: 400 });
    }

    await prisma.inventory.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "服务器内部错误" }, { status: 500 });
  }
}
