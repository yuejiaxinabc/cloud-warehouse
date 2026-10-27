import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "缺少仓库ID" }),
        { status: 400 }
      );
    }

    // 获取仓库信息
    const warehouse = await prisma.warehouse.findUnique({
      where: { id: BigInt(warehouseId) },
    });

    if (!warehouse) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "仓库不存在" }),
        { status: 404 }
      );
    }

    // 获取该仓库的所有区域
    const zones = await prisma.zone.findMany({
      where: { warehouseId: BigInt(warehouseId) },
      include: {
        locations: true,
      },
    });

    // 获取该仓库的货位库存明细（聚合库存 + 货位分布）
    const locationStocks = await prisma.locationStock.findMany({
      where: { warehouseId: BigInt(warehouseId) },
      include: {
        product: true,
        location: true,
      },
    });

    // 获取该仓库所有已停用的货位（用于前端灰色标记）
    const deactivatedBoxes = await prisma.box.findMany({
      where: {
        status: 0,
        location: { zone: { warehouseId: BigInt(warehouseId) } },
      },
      select: { id: true, code: true, locationId: true },
    });
    const deactivatedByLocation = new Map<string, { id: string; code: string }[]>();
    for (const b of deactivatedBoxes) {
      const key = b.locationId.toString();
      if (!deactivatedByLocation.has(key)) deactivatedByLocation.set(key, []);
      deactivatedByLocation.get(key)!.push({ id: b.id.toString(), code: b.code });
    }

    // 按货位汇总数量（同一货位可能有多个商品）
    // 商品名/编码/ID 都允许 null：货位明细可能指向已删除商品，兜底来源也可能缺字段
    type StockItem = { productName: string | null; productCode: string | null; productId: string | null; quantity: number; lotNumber: string | null };
    const stockByLocation = new Map<string, { quantity: number; items: StockItem[] }>();
    for (const ls of locationStocks) {
      const key = ls.locationId.toString();
      const qty = Number(ls.quantity || 0);
      const entry = stockByLocation.get(key) || { quantity: 0, items: [] };
      entry.quantity += qty;
      entry.items.push({
        productName: ls.product?.name || null,
        productCode: ls.product?.code || null,
        productId: ls.productId?.toString() || null,
        quantity: qty,
        lotNumber: ls.lotNumber || null,
      });
      stockByLocation.set(key, entry);
    }

    // ===== 兜底（FIX-2026-1013）=====
    // 历史上 stock-in 只写 inventory 不写 location_stocks，导致货架地图一片空白：
    // 货在库里、位在图上，两边对不上。这里对没有货位明细的库存按
    // inventory.location_id 兜底补出来，保证「有货就一定有货架」。
    const inventoriesWithLocation = await prisma.inventory.findMany({
      where: {
        warehouseId: BigInt(warehouseId),
        locationId: { not: null },
      },
      include: { product: { select: { name: true, code: true } } },
    });
    for (const inv of inventoriesWithLocation) {
      const locId = inv.locationId!.toString();
      const entry = stockByLocation.get(locId);
      const qty = Number(inv.onHand || 0);
      if (qty <= 0) continue;

      const already = entry?.items.some(it => it.productId === inv.productId.toString());
      if (already) continue;   // 已有货位明细，不重复计

      const target = entry || { quantity: 0, items: [] };
      target.quantity += qty;
      target.items.push({
        productName: (inv.product?.name ?? null) as any,
        productCode: (inv.product?.code ?? null) as any,
        productId: inv.productId.toString(),
        quantity: qty,
        lotNumber: null as any,
      });
      stockByLocation.set(locId, target);
    }

    // 构建库位数据
    const locationData: any[] = [];

    // 遍历区域和库位
    for (const zone of zones) {
      for (const location of zone.locations) {
        const stock = stockByLocation.get(location.id.toString());

        locationData.push({
          id: location.id.toString(),
          code: location.code,
          name: location.name,
          zoneCode: zone.code,
          zoneName: zone.name,
          type: location.type,
          capacity: location.capacity ? Number(location.capacity) : null,
          status: location.status,
          deactivatedBoxes: deactivatedByLocation.get(location.id.toString()) || [],
          quantity: stock?.quantity || 0,
          productName: stock?.items[0]?.productName || null,
          productCode: stock?.items[0]?.productCode || null,
          productId: stock?.items[0]?.productId || null,
          items: stock?.items || [],
        });
      }
    }

    return NextResponse.json(
      serializeBigInt({
        success: true,
        data: locationData,
        warehouse: {
          id: warehouse.id.toString(),
          name: warehouse.name,
          code: warehouse.code,
        },
        zones: zones.map((z: any) => ({
          id: z.id.toString(),
          name: z.name,
          code: z.code,
          locationCount: z.locations.length,
          sealedCount: z.locations.filter((l: any) => l.status === 0).length,
          activeCount: z.locations.filter((l: any) => l.status === 1).length,
        })),
      })
    );
  } catch (error: any) {
    console.error("Shelf map API error:", error);
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
