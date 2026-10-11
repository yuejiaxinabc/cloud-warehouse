import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/** GET /api/v1/mp/box?code=A-1-1-1 - 按盒子码反查（扫码入库定位用） */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const { searchParams } = new URL(req.url);
    const code = (searchParams.get('code') || '').trim();
    if (!code) {
      return NextResponse.json({ success: false, error: '缺少盒子码' }, { status: 400 });
    }

    const box = await prisma.box.findFirst({
      where: { code },
      include: {
        location: {
          select: {
            id: true, code: true,
            zone: { select: { id: true, code: true, warehouseId: true, warehouse: { select: { id: true, name: true, code: true } } } },
          },
        },
      },
    });

    if (!box) {
      return NextResponse.json({ success: false, error: `未找到盒子 ${code}` }, { status: 404 });
    }

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        boxId: Number(box.id),
        boxCode: box.code,
        locationId: Number(box.location.id),
        locationCode: box.location.code,
        warehouseId: Number(box.location.zone.warehouseId),
        warehouseName: box.location.zone.warehouse?.name || '',
      },
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
