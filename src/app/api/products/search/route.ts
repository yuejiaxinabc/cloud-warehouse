import { handleApiError } from "@/lib/errors";
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get("keyword") || "";

    if (!keyword.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const products = await prisma.product.findMany({
      where: {
        OR: [
          { code: { contains: keyword } },
          { name: { contains: keyword } },
          { barcode: { contains: keyword } },
          { spec: { contains: keyword } },
          { brand: { contains: keyword } },
          { model: { contains: keyword } },
          { remark: { contains: keyword } },
        ],
        status: 1,
      },
      include: {
        category: true,
        unit: true,
        inventories: {
          include: {
            warehouse: true,
            locationStocks: {
              include: { location: true },
              orderBy: { id: "asc" },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: 50,
    });

    const result: any[] = [];

    for (const p of products) {
      if (p.inventories.length === 0) {
        // 无库存商品
        result.push({
          id: p.id.toString(),
          code: p.code,
          name: p.name,
          barcode: p.barcode,
          spec: p.spec,
          brand: p.brand,
          model: p.model,
          categoryName: p.category?.name || null,
          unitName: p.unit?.name || null,
          warehouseId: null,
          warehouseName: null,
          locationCode: null,
          quantity: 0,
          status: p.status,
        });
      } else {
        // 按仓库聚合：一个商品+一个仓库 = 一条
        for (const inv of p.inventories) {
          const stockQty = inv.locationStocks.reduce(
            (s: number, ls: any) => s + Number(ls.quantity || 0),
            0
          );
          // 查找每个 locationStock 对应的盒子编码
          const locationCodes: string[] = [];
          for (const ls of inv.locationStocks) {
            const box = await prisma.box.findFirst({
              where: {
                locationId: ls.locationId,
                remark: "product:" + p.id,
              },
              select: { code: true },
            });
            locationCodes.push(box?.code || ls.location?.code || '');
          }

          result.push({
            id: `${p.id}-${inv.warehouseId}`,
            productId: p.id.toString(),
            code: p.code,
            name: p.name,
            barcode: p.barcode,
            spec: p.spec,
            brand: p.brand,
            model: p.model,
            categoryName: p.category?.name || null,
            unitName: p.unit?.name || null,
            warehouseId: inv.warehouseId?.toString(),
            warehouseName: inv.warehouse?.name || null,
            locationCode: locationCodes.length > 0 ? locationCodes.join(", ") : null,
            quantity: stockQty,
            avgCost: Number(inv.avgCost || 0),
            status: p.status,
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: serializeBigInt(result) });
  } catch (error: any) {
    console.error("Product search error:", error);
    return handleApiError(error);
  }
}
