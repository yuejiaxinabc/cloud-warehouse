import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/**
 * GET /api/v1/mp/inventory/search?keyword=xxx
 * 商品库存查询：支持 商品名称 / 商品编码 / 条码 / 批次号
 */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const { searchParams } = new URL(req.url);
    const keyword = (searchParams.get('keyword') || '').trim();
    if (!keyword) {
      return NextResponse.json({ success: false, error: '请输入搜索关键词' }, { status: 400 });
    }

    // 1. 按名称/编码/条码搜商品
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: keyword } },
          { code: { contains: keyword } },
          { barcode: keyword },
        ],
      },
      include: {
        inventories: { include: { warehouse: { select: { id: true, name: true, code: true } } } },
      },
      take: 20,
      orderBy: { id: 'desc' },
    });

    // 2. 按批次号搜库存批次
    const lots = await prisma.inventoryLot.findMany({
      where: { lotNumber: { contains: keyword } },
      include: {
        product: { select: { id: true, name: true, code: true, model: true, spec: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      take: 50,
      orderBy: { id: 'desc' },
    });

    // 合并（按商品去重）
    const map = new Map<number, any>();
    for (const p of products) {
      map.set(Number(p.id), {
        id: Number(p.id),
        code: p.code,
        name: p.name,
        model: p.model || '',
        spec: p.spec || '',
        barcode: p.barcode || '',
        totalStock: p.inventories.reduce((s: number, inv: any) => s + Number(inv.onHand || 0), 0),
        warehouses: p.inventories
          .filter((inv: any) => Number(inv.onHand) > 0)
          .map((inv: any) => ({
            warehouseId: Number(inv.warehouseId),
            warehouseName: inv.warehouse?.name || '',
            onHand: Number(inv.onHand || 0),
          })),
        lots: [],
        matchedByLot: false,
      });
    }
    for (const lot of lots) {
      const pid = Number(lot.product.id);
      if (!map.has(pid)) {
        map.set(pid, {
          id: pid,
          code: lot.product.code,
          name: lot.product.name,
          model: lot.product.model || '',
          spec: lot.product.spec || '',
          barcode: '',
          totalStock: 0,
          warehouses: [],
          lots: [],
          matchedByLot: true,
        });
      }
      const item = map.get(pid);
      item.lots.push({
        lotNumber: lot.lotNumber,
        warehouseName: lot.warehouse?.name || '',
        quantity: Number(lot.quantity || 0),
      });
    }

    const items = Array.from(map.values()).slice(0, 30);
    return NextResponse.json({ success: true, data: { items, total: items.length } });
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
