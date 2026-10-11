import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

/**
 * GET /api/warehouse/structure?warehouseId=X
 * 一次返回仓库的完整结构：区域 → 货位 → 盒子
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get('warehouseId');
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '缺少仓库ID' }, { status: 400 });
    }

    const zones = await prisma.zone.findMany({
      where: { warehouseId: BigInt(warehouseId) },
      include: {
        locations: {
          where: { status: 1 },
          include: {
            boxes: {
              where: { status: 1 },
              orderBy: { id: 'asc' },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });

    const result = zones.map((z: any) => ({
      id: z.id.toString(),
      code: z.code,
      name: z.name,
      locations: z.locations.map((loc: any) => ({
        id: loc.id.toString(),
        code: loc.code,
        name: loc.name,
        boxes: loc.boxes.map((b: any) => ({
          id: b.id.toString(),
          code: b.code,
          locationId: loc.id.toString(),
          locationCode: loc.code,
          zoneCode: z.code,
        })),
      })),
    }));

    return NextResponse.json(serializeBigInt({ success: true, data: result }));
  } catch (error: any) {
    console.error('[Warehouse Structure API] Error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
