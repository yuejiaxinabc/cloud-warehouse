import { businessAccess, assertWarehouseAllowed, withWarehouseScope, checkZone, checkLocation } from '@/app/api/warehouse/access';
import { getServerSession } from 'next-auth';
import { requireRole } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { safeErrorMessage, handleApiError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';

export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess();
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zoneId");
    const warehouseId = searchParams.get("warehouseId");

    const where: any = { zone: withWarehouseScope({}, scope) };
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

    const toInt = (v: string | null, def: number) => {
      const n = Number.parseInt(v ?? "", 10);
      return Number.isFinite(n) && n > 0 ? n : def;
    };
    const MAX_PAGE_SIZE = 2000;

    // v1.2.1（P1-9）：empty/keyword 过滤下沉到 SQL，先过滤再分页。
    // 原来 2600 条全量返回（?page=1&pageSize=3 也回 978KB），且 page/pageSize 完全不生效。
    const onlyEmpty = searchParams.get("empty") === "1";
    const keyword = (searchParams.get("keyword") || "").trim();
    if (onlyEmpty) {
      // 空货位 = 没有任何 quantity > 0 的货位明细
      where.NOT = { locationStocks: { some: { quantity: { gt: 0 } } } };
    }
    if (keyword) where.code = { contains: keyword };

    const limitRaw = searchParams.get("limit");
    const legacyLimit = limitRaw ? Math.min(toInt(limitRaw, 0) || 0, MAX_PAGE_SIZE) : 0;
    const paged = searchParams.has("page") || searchParams.has("pageSize");
    const page = toInt(searchParams.get("page"), 1);
    const pageSize = Math.min(toInt(searchParams.get("pageSize"), 200), MAX_PAGE_SIZE);
    // 取数策略：显式分页 > 旧 limit 截断（兼容 products 页的 limit=400）> 默认第一页 200 条
    const take = paged ? pageSize : (legacyLimit || pageSize);
    const skip = paged ? (page - 1) * pageSize : 0;

    const [total, locations] = await Promise.all([
      prisma.location.count({ where }),
      prisma.location.findMany({
        where,
        orderBy: { code: "asc" },
        skip,
        take,
      }),
    ]);

    // FIX-2026-1023：附带每个货位当前占用的商品，前端据此过滤下拉，
    // 避免用户选到「已被别的商品占用」的货位。
    // 只查当前页的货位，避免 2600 个 ID 的 IN 查询（P1-9）
    const stocks = locations.length === 0 ? [] : await prisma.locationStock.findMany({
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

    const data = locations.map((l) => {
      const o = occ.get(l.id.toString());
      return {
        ...l,
        occupiedBy: o || null,
        // true = 空货位，任何商品都能放
        isEmpty: !o,
      };
    });

    // data 仍是当前页数组（前端现有读 data 的写法不变），额外给出 total/page/pageSize
    return NextResponse.json(serializeBigInt({
      success: true,
      data,
      total,
      page: paged ? page : 1,
      pageSize: take,
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // v1.2.1：仓库结构写操作限 admin / 仓库主管（P0-1）
    await requireRole('admin', 'wh_manager');
    const { session, scope } = await businessAccess();
    const body = await req.json();
    await checkZone(scope, body.zoneId);
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
    await writeLog({ module: 'warehouse', action: 'location_create', userId: (session.user as { id: string }).id, ip: getClientIp(), refType: 'location', refId: location.id, content: `创建货位 ${location.code}` });
    return NextResponse.json(serializeBigInt({ success: true, data: location }));
  } catch (error: any) {
    return handleApiError(error);
  }
}
