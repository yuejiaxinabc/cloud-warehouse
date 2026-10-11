import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get('warehouseId');
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '缺少 warehouseId' }, { status: 400 });
    }

    // 查询该仓库下所有启用的货位和货位
    const where: any = {
      status: 1,
      zone: { warehouseId: BigInt(warehouseId) },
    };
    if (keyword) {
      where.code = { contains: keyword };
    }

    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where,
        include: {
          zone: true,
          boxes: {
            where: { status: 1 },
            select: { id: true, code: true, remark: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { code: 'asc' },
      }),
      prisma.location.count({ where }),
    ]);

    // 计算每个货位的空闲货位数
    const items = locations.map((loc: any) => {
      const totalBoxes = loc.boxes.length;
      const occupiedBoxes = loc.boxes.filter((b: any) => b.remark && b.remark.trim() !== '').length;
      const freeBoxes = totalBoxes - occupiedBoxes;
      const firstFreeBox = loc.boxes.find((b: any) => !b.remark || b.remark.trim() === '');
      
      return {
        locationId: loc.id.toString(),
        locationCode: loc.code,
        zoneName: loc.zone.name,
        zoneCode: loc.zone.code,
        totalBoxes,
        occupiedBoxes,
        freeBoxes,
        firstFreeBoxCode: firstFreeBox?.code || null,
        boxCodes: loc.boxes.map((b: any) => ({
          code: b.code,
          occupied: !!(b.remark && b.remark.trim() !== ''),
        })),
      };
    });

    return NextResponse.json({ success: true, data: { items, total, page, pageSize } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
