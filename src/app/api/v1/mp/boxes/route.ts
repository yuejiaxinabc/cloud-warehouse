import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/** GET /api/v1/mp/boxes?locationId=1 - 盒子列表（货架-排-列-盒） */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get('locationId');
    if (!locationId) {
      return NextResponse.json({ success: false, error: '缺少货位ID' }, { status: 400 });
    }

    const boxes = await prisma.box.findMany({
      where: { locationId: BigInt(Number(locationId)), status: 1 },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json(serializeBigInt({ success: true, data: boxes.map((b) => ({ id: Number(b.id), code: b.code })) }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
