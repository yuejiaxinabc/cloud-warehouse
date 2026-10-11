import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

// GET /api/warehouse/locations/available?warehouseId=X
// 返回可用货位列表：一个货位装一种货，不限数量
export async function GET(req: NextRequest) {
  try {
    const warehouseId = req.nextUrl.searchParams.get('warehouseId');
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '缺少 warehouseId' }, { status: 400 });
    }

    // 获取所有区域和货位（含货位）
    const zones = await prisma.zone.findMany({
      where: { warehouseId: BigInt(warehouseId) },
      orderBy: { code: 'asc' },
      include: {
        locations: {
          orderBy: { code: 'asc' },
          include: {
            boxes: { orderBy: { code: 'asc' } },
          },
        },
      },
    });

    const result: any[] = [];

    for (const zone of zones) {
      for (const loc of zone.locations) {
        // 跳过停用货位
        if (loc.status !== 1) continue;

        const activeBoxes = loc.boxes.filter((b: any) => b.status === 1);
        const sealedBoxes = loc.boxes.filter((b: any) => b.status !== 1);

        // 空闲货位 = 启用且 remark 为空的货位（一个货位装一种货，不限数量）
        const freeBoxes = activeBoxes.filter((b: any) => !b.remark || b.remark.trim() === '');

        if (freeBoxes.length === 0) continue; // 没有空闲货位，跳过

        result.push({
          locationId: loc.id.toString(),
          locationCode: loc.code,
          zoneCode: zone.code,
          zoneName: zone.name,
          activeBoxes: activeBoxes.length,
          freeBoxes: freeBoxes.length,
          sealedBoxes: sealedBoxes.length,
          label: `${zone.name} ${loc.code} (${freeBoxes.length}空闲)`,
        });
      }
    }

    return NextResponse.json({ success: true, data: serializeBigInt(result) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
