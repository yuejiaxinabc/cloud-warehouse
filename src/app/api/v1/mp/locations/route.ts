import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/** GET /api/v1/mp/locations?warehouseId=1 - 货位列表（货架-排-列） */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get('warehouseId');
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '缺少仓库ID' }, { status: 400 });
    }

    const zones = await prisma.zone.findMany({
      where: { warehouseId: BigInt(Number(warehouseId)) },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });

    const locations = await prisma.location.findMany({
      where: { zoneId: { in: zones.map((z) => z.id) } },
      select: { id: true, code: true, name: true, zoneId: true },
      orderBy: { code: 'asc' },
    });

    const zoneMap = new Map(zones.map((z) => [Number(z.id), z.code]));
    const data = locations.map((l) => ({
      id: Number(l.id),
      code: l.code,
      zoneCode: zoneMap.get(Number(l.zoneId)) || '',
    }));

    return NextResponse.json(serializeBigInt({ success: true, data }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
