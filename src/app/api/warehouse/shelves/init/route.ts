import { businessAccess, assertWarehouseAllowed, checkZone, checkLocation, warehouseWhere } from '@/app/api/warehouse/access';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { writeLog, getClientIp } from '@/lib/log';
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
    // v1.2.1：仓库结构写操作限 admin / 仓库主管（P0-1）
    await requireRole('admin', 'wh_manager');
    const { session, scope } = await businessAccess();
    await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const warehouseId = body?.warehouseId;

    if (warehouseId) await assertWarehouseAllowed(scope, Number(warehouseId));
    const warehouses = warehouseId
      ? await prisma.warehouse.findMany({ where: { id: BigInt(warehouseId) }, select: { id: true, name: true } })
      : await prisma.warehouse.findMany({ where: warehouseWhere(scope), select: { id: true, name: true }, orderBy: { id: 'asc' } });

    if (!warehouses.length) {
      return NextResponse.json({ success: false, error: '没有可处理的仓库' }, { status: 400 });
    }

    const report: { warehouseId: string; name: string; zonesCreated: number; locationsCreated: number }[] = [];

    for (const wh of warehouses) {
      const r = await prisma.$transaction(async (tx) => ensureShelves(tx, wh.id), { timeout: 120000 });
      await writeLog({ module: 'warehouse', action: 'shelves_init', userId: (session.user as { id: string }).id, ip: getClientIp(), refType: 'warehouse', refId: wh.id, content: `补齐货架：新增 ${r.zonesCreated} 个货区、${r.locationsCreated} 个货位` });
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