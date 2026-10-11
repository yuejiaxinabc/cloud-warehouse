import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/** GET /api/v1/mp/warehouses - 仓库列表 */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const warehouses = await prisma.warehouse.findMany({
      select: { id: true, name: true, code: true, address: true },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: warehouses }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
