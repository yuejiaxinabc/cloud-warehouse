import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zoneId");
    const warehouseId = searchParams.get("warehouseId");

    const where: any = {};
    if (zoneId) {
      where.zoneId = BigInt(zoneId);
    } else if (warehouseId) {
      // 先查该仓库下的所有区域
      const zones = await prisma.zone.findMany({
        where: { warehouseId: BigInt(warehouseId) },
        select: { id: true },
      });
      where.zoneId = { in: zones.map(z => z.id) };
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: { code: "asc" },
    });

    // FIX-2026-1023：附带每个货位当前占用的商品，前端据此过滤下拉，
    // 避免用户选到「已被别的商品占用」的货位。
    const stocks = await prisma.locationStock.findMany({
      where: { locationId: { in: locations.map((l) => l.id) }, quantity: { gt: 0 } },
      select: {
        locationId: true,
        productId: true,
        product: { select: { code: true, name: true } },
      },
    });
    const occ = new Map<string, { productId: string; productCode: string; productName: string }>();
    for (const s of stocks) {
      const k = s.locationId.toString();
      if (!occ.has(k)) {
        occ.set(k, {
          productId: s.productId.toString(),
          productCode: s.product?.code || '',
          productName: s.product?.name || '',
        });
      }
    }

    let data = locations.map((l) => {
      const o = occ.get(l.id.toString());
      return {
        ...l,
        occupiedBy: o || null,
        // true = 空货位，任何商品都能放
        isEmpty: !o,
      };
    });

    // v1.1.1：支持按「空货位」过滤与关键词搜索，前端下拉不再一次拉 2600 条
    const onlyEmpty = searchParams.get("empty") === "1";
    const keyword = (searchParams.get("keyword") || "").trim().toUpperCase();
    if (onlyEmpty) data = data.filter((l) => l.isEmpty);
    if (keyword) data = data.filter((l) => String(l.code).toUpperCase().includes(keyword));

    const limitRaw = parseInt(searchParams.get("limit") || "0", 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 2000) : 0;
    const total = data.length;
    if (limit) data = data.slice(0, limit);

    return NextResponse.json(serializeBigInt({ success: true, data, total }));
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const location = await prisma.location.create({
      data: {
        name: body.name,
        code: body.code,
        zoneId: BigInt(body.zoneId),
        type: body.type || "shelf",
        capacity: body.capacity ? Number(body.capacity) : null,
        remark: body.remark || null,
        status: 1,
      },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: location }));
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
