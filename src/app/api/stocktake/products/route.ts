import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/stocktake/products - 获取有库存的商品（用于全盘盘点）
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('stocktake:view', auth);
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get('warehouseId');

    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '请选择仓库' }, { status: 400 });
    }

    await assertWarehouseAllowed(await getDataScope(auth.user), Number(warehouseId));
    // 查询该仓库有库存的商品
    const inventories = await prisma.inventory.findMany({
      where: {
        warehouseId: Number(warehouseId),
        onHand: { gt: 0 },
      },
      include: {
        product: true,
      },
      orderBy: { productId: 'asc' },
    });

    // 去重并汇总每个商品的库存
    const productMap = new Map();
    inventories.forEach((inv: any) => {
      const pid = Number(inv.productId);
      if (!productMap.has(pid)) {
        productMap.set(pid, {
          id: pid,
          productId: pid,
          product: inv.product,
          systemQty: 0,
        });
      }
      productMap.get(pid).systemQty += Number(inv.onHand || 0);
    });

    const items = Array.from(productMap.values());

    return NextResponse.json({
      success: true,
      data: serializeBigInt(items),
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}
