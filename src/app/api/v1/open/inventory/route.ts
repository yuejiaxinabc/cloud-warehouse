import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOpenApiAccess } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

/** GET /api/v1/open/inventory?warehouseId=1&page=1&pageSize=200 —— 对外库存快照 */
export async function GET(req: NextRequest) {
  try {
    // P1-4：鉴权移进 try，表缺失 → 503 可读 JSON
    const guard = await requireOpenApiAccess(req);
    if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

    const sp = req.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') || '200', 10)));

    const where: any = {};
    if (warehouseId) where.warehouseId = BigInt(warehouseId);

    const [items, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: { product: { select: { code: true, name: true } }, warehouse: { select: { code: true, name: true } } },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventory.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total, page, pageSize,
        items: items.map((i: any) => ({
          productCode: i.product?.code,
          productName: i.product?.name,
          warehouseCode: i.warehouse?.code,
          warehouseName: i.warehouse?.name,
          onHand: Number(i.onHand),
          locked: Number(i.locked),
          available: Number(i.onHand) - Number(i.locked),
          avgCost: i.avgCost ? Number(i.avgCost) : null,
          version: i.version,
          updatedAt: i.updatedAt,
        })),
      },
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}