import { businessAccess, assertWarehouseAllowed, withWarehouseScope, checkZone, checkLocation } from '@/app/api/warehouse/access';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
// M3：错误统一走 handleApiError，不再回显 error.message
import { handleApiError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-guard';

// GET /api/warehouse/locations/available?warehouseId=X&limit=N
// 返回可用（空闲）货位列表：一个货位装一种货，不限数量
//
// v1.2.1（P1-10）：判空改看 location_stocks。
// 原来用已废弃的 boxes 表判空（loc.boxes.filter(b => !b.remark)），
// 而货位与商品的绑定自 v1.1.1 起就迁到了 location_stocks，
// boxes 只剩历史数据 → freeBoxes 恒为空 → 接口永远返回 data: []。
export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess();
    await requireAuth(req);
    const warehouseId = req.nextUrl.searchParams.get('warehouseId');
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '缺少 warehouseId' }, { status: 400 });
    }

    await assertWarehouseAllowed(scope, Number(warehouseId));
// 一次性取出「已被占用」的货位集合，循环内 O(1)，避免每个货位一次查询（N+1）
    const occupied = await prisma.locationStock.findMany({
      where: { warehouseId: BigInt(warehouseId), quantity: { gt: 0 } },
      select: { locationId: true },
      distinct: ['locationId'],
    });
    const occupiedIds = new Set(occupied.map((o) => o.locationId.toString()));

    const zones = await prisma.zone.findMany({
      where: { warehouseId: BigInt(warehouseId) },
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        locations: {
          where: { status: 1 }, // 跳过停用货位
          orderBy: { code: 'asc' },
          select: { id: true, code: true },
        },
      },
    });

    const result: any[] = [];
    for (const zone of zones) {
      for (const loc of zone.locations) {
        if (occupiedIds.has(loc.id.toString())) continue; // 已被商品占用，跳过
        result.push({
          locationId: loc.id.toString(),
          locationCode: loc.code,
          zoneCode: zone.code,
          zoneName: zone.name,
          label: `${zone.name} ${loc.code}（空闲）`,
        });
      }
    }

    // 附带 limit，避免大仓一次拉回 2600 条（默认不过滤，保持旧行为）
    const limitRaw = Number.parseInt(req.nextUrl.searchParams.get('limit') || '0', 10);
    const total = result.length;
    const data = Number.isFinite(limitRaw) && limitRaw > 0
      ? result.slice(0, Math.min(limitRaw, 2000))
      : result;

    return NextResponse.json({ success: true, data: serializeBigInt(data), total });
  } catch (error: any) {
    return handleApiError(error);
  }
}
