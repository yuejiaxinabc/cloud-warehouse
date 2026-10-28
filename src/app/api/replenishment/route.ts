import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';

/**
 * GET /api/replenishment
 *
 * v1.2 补货建议：把「安全库存触发」变成一张可直接下单的建议表。
 * 算法（可解释，不搞黑盒）：
 *   可用量 = onHand - locked
 *   缺口   = 安全库存 - 可用量
 *   建议量 = 缺口 > 0 ? ceil(缺口) : 0
 *   若设了库存上限，建议量不超过 (上限 - 可用量)，避免一次补爆仓。
 */
export async function GET(req: NextRequest) {
  await requireAuth(req);
  try {
    const sp = req.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');

    const products = await prisma.product.findMany({
      where: { status: 1 },
      include: {
        unit: { select: { name: true } },
        inventories: warehouseId
          ? { where: { warehouseId: BigInt(warehouseId) } }
          : true,
      },
    });

    const rows: any[] = [];
    for (const p of products) {
      const safety = Number(p.safetyStock || 0);
      if (safety <= 0) continue; // 没设安全库存的商品不参与补货建议

      const byWarehouse = new Map<string, { onHand: number; locked: number; name: string }>();
      for (const inv of (p as any).inventories || []) {
        const key = String(inv.warehouseId);
        const cur = byWarehouse.get(key) || { onHand: 0, locked: 0, name: '' };
        cur.onHand += Number(inv.onHand || 0);
        cur.locked += Number(inv.locked || 0);
        byWarehouse.set(key, cur);
      }

      if (byWarehouse.size === 0) {
        // 完全没有库存记录的仓库维度，按 0 库存处理（仍给出建议）
        byWarehouse.set(String(warehouseId || ''), { onHand: 0, locked: 0, name: '' });
      }

      const warehouses = await prisma.warehouse.findMany({
        where: { id: { in: [...byWarehouse.keys()].filter(Boolean).map((k) => BigInt(k)) } },
        select: { id: true, name: true },
      });
      const whName = new Map(warehouses.map((w) => [String(w.id), w.name]));

      for (const [whId, agg] of byWarehouse) {
        const available = agg.onHand - agg.locked;
        const gap = safety - available;
        if (gap <= 0) continue;

        const maxStock = Number(p.maxStock || 0);
        let suggest = Math.ceil(gap);
        if (maxStock > 0) suggest = Math.max(1, Math.min(suggest, Math.ceil(maxStock - available)));

        rows.push({
          productId: String(p.id),
          code: p.code,
          name: p.name,
          unit: p.unit?.name || '',
          warehouseId: whId,
          warehouseName: whName.get(whId) || '未分配仓库',
          onHand: agg.onHand,
          locked: agg.locked,
          available,
          safetyStock: safety,
          maxStock: maxStock || null,
          suggestQty: suggest,
        });
      }
    }

    rows.sort((a, b) => b.suggestQty - a.suggestQty);
    return NextResponse.json(serializeBigInt({ success: true, data: rows }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '补货建议计算失败' }, { status: 500 });
  }
}
