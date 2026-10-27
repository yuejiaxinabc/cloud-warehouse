import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { ensureShelves, SHELF_LETTERS } from '@/lib/shelf-init';

/**
 * POST /api/warehouse/shelves/init
 * 补齐仓库货架：确保每个仓库都有 A-Z 26 个货架，每个货架 10列×10位 货位。
 * 幂等，可重复调用。
 *
 * body: { warehouseId?: number }  不传则处理全部仓库
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const warehouseId = body?.warehouseId;

    const warehouses = warehouseId
      ? await prisma.warehouse.findMany({ where: { id: BigInt(warehouseId) }, select: { id: true, name: true } })
      : await prisma.warehouse.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });

    if (!warehouses.length) {
      return NextResponse.json({ success: false, error: '没有可处理的仓库' }, { status: 400 });
    }

    const report: { warehouseId: string; name: string; zonesCreated: number; locationsCreated: number }[] = [];

    for (const wh of warehouses) {
      const r = await prisma.$transaction(async (tx) => ensureShelves(tx, wh.id), { timeout: 120000 });
      report.push({
        warehouseId: wh.id.toString(),
        name: wh.name,
        zonesCreated: r.zonesCreated,
        locationsCreated: r.locationsCreated,
      });
    }

    return NextResponse.json({
      success: true,
      data: { shelfLetters: SHELF_LETTERS.length, warehouses: report },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}