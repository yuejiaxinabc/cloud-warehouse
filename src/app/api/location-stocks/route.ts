import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requirePermission } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import { allocateLocation, positiveId } from './allocate';
import { businessAccess, assertWarehouseAllowed, withWarehouseScope } from '@/app/api/warehouse/access';

// POST quantity means a move/allocation, never another receipt of posted inventory.
export async function POST(req: NextRequest) {
  try {
    const { scope } = await businessAccess('stock_in:create');
    const body = await req.json();
    await assertWarehouseAllowed(scope, Number(positiveId(body.warehouseId, '仓库ID')));
    await prisma.$transaction(tx => allocateLocation(tx, body), { isolationLevel: 'ReadCommitted' });
    return NextResponse.json({ success: true, message: '货位分配成功' });
  } catch (error) {
    return handleApiError(error);
  }
}

// GET - 查询货位库存
export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess('inventory:view');
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get('warehouseId');
    const productId = searchParams.get('productId');

    const where: any = {};
    if (warehouseId) where.warehouseId = Number(warehouseId);
    if (productId) where.productId = Number(productId);

    const stocks = await prisma.locationStock.findMany({
      where: withWarehouseScope(where, scope),
      include: {
        location: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(serializeBigInt({ success: true, data: stocks }));
  } catch (error: any) {
    console.error('[LocationStock GET] Error:', error);
    return handleApiError(error);
  }
}