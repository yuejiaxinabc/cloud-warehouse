import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

/**
 * GET /api/inventory/analysis?type=recon|stale|abc|replenish
 *
 * 四类库存健康度分析（FIX-2026-1016）：
 *  - recon      账实对账：库存余额 vs 流水累计
 *  - stale      呆滞料 / 库龄
 *  - abc        ABC 分类（按出库金额帕累托）
 *  - replenish  补货建议（低于安全库存）
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'recon';
    const days = Math.max(1, parseInt(searchParams.get('days') || '90', 10));

    if (type === 'recon') {
      const inventories = await prisma.inventory.findMany({
        include: {
          product: { select: { code: true, name: true } },
          warehouse: { select: { name: true } },
        },
      });

      const sums = await prisma.inventoryTransaction.groupBy({
        by: ['productId', 'warehouseId'],
        _sum: { quantity: true },
        _count: { id: true },
      });
      const sumMap = new Map<string, { sum: number; count: number }>();
      for (const s of sums) {
        sumMap.set(`${s.productId}-${s.warehouseId}`, {
          sum: Number(s._sum.quantity || 0),
          count: s._count.id,
        });
      }

      const rows = inventories.map((inv) => {
        const key = `${inv.productId}-${inv.warehouseId}`;
        const t = sumMap.get(key);
        const onHand = Number(inv.onHand || 0);
        const txnSum = t?.sum ?? 0;
        const txnCount = t?.count ?? 0;
        return {
          productCode: inv.product?.code || '-',
          productName: inv.product?.name || '-',
          warehouseName: inv.warehouse?.name || '-',
          onHand,
          txnSum,
          diff: Number((onHand - txnSum).toFixed(3)),
          txnCount,
          status: txnCount === 0 ? 'no_txn' : Math.abs(onHand - txnSum) > 0.001 ? 'mismatch' : 'ok',
        };
      });

      const mismatch = rows.filter((r) => r.status === 'mismatch');
      const noTxn = rows.filter((r) => r.status === 'no_txn');

      return NextResponse.json(serializeBigInt({
        success: true,
        data: {
          total: rows.length,
          mismatchCount: mismatch.length,
          noTxnCount: noTxn.length,
          rows: [...mismatch, ...noTxn].slice(0, 500),
        },
      }));
    }

    if (type === 'stale') {
      const since = new Date(Date.now() - days * 86400000);
      const inventories = await prisma.inventory.findMany({
        where: { onHand: { gt: 0 } },
        include: {
          product: { select: { code: true, name: true, safetyStock: true } },
          warehouse: { select: { name: true } },
        },
      });

      const lastTxns = await prisma.inventoryTransaction.groupBy({
        by: ['productId', 'warehouseId'],
        _max: { txnTime: true },
      });
      const lastMap = new Map<string, Date | null>();
      for (const t of lastTxns) {
        lastMap.set(`${t.productId}-${t.warehouseId}`, t._max.txnTime);
      }

      const rows = inventories
        .map((inv) => {
          const last = lastMap.get(`${inv.productId}-${inv.warehouseId}`) || null;
          const ref = last || inv.createdAt;
          const idleDays = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
          const avgCost = Number(inv.avgCost || 0);
          const qty = Number(inv.onHand || 0);
          return {
            productCode: inv.product?.code || '-',
            productName: inv.product?.name || '-',
            warehouseName: inv.warehouse?.name || '-',
            quantity: qty,
            avgCost,
            amount: Number((qty * avgCost).toFixed(2)),
            lastMoveAt: last ? new Date(last).toISOString() : null,
            idleDays,
            stale: idleDays >= days,
          };
        })
        .filter((r) => r.stale)
        .sort((a, b) => b.idleDays - a.idleDays);

      return NextResponse.json(serializeBigInt({
        success: true,
        data: {
          days,
          count: rows.length,
          amount: Number(rows.reduce((s, r) => s + r.amount, 0).toFixed(2)),
          rows: rows.slice(0, 500),
        },
      }));
    }

    if (type === 'abc') {
      const since = new Date(Date.now() - 365 * 86400000);
      const outbound = await prisma.inventoryTransaction.findMany({
        where: { txnType: 'OUTBOUND', txnTime: { gte: since } },
        select: { productId: true, quantity: true, costPrice: true },
      });

      const amountMap = new Map<string, number>();
      for (const t of outbound) {
        const amt = Math.abs(Number(t.quantity || 0)) * Number(t.costPrice || 0);
        amountMap.set(t.productId.toString(), (amountMap.get(t.productId.toString()) || 0) + amt);
      }

      const total = Array.from(amountMap.values()).reduce((s, v) => s + v, 0);
      const sorted = Array.from(amountMap.entries()).sort((a, b) => b[1] - a[1]);

      const ids = sorted.map(([id]) => BigInt(id));
      const products = ids.length
        ? await prisma.product.findMany({
            where: { id: { in: ids } },
            select: { id: true, code: true, name: true },
          })
        : [];
      const pMap = new Map(products.map((p) => [p.id.toString(), p]));

      let cum = 0;
      const rows = sorted.map(([id, amount]) => {
        cum += amount;
        const share = total > 0 ? cum / total : 0;
        const p = pMap.get(id);
        return {
          productCode: p?.code || '-',
          productName: p?.name || '-',
          outboundAmount: Number(amount.toFixed(2)),
          share: Number((amount / (total || 1) * 100).toFixed(2)),
          cumulativeShare: Number((share * 100).toFixed(2)),
          grade: share <= 0.7 ? 'A' : share <= 0.9 ? 'B' : 'C',
        };
      });

      const summary = { A: 0, B: 0, C: 0 } as Record<string, number>;
      for (const r of rows) summary[r.grade]++;

      return NextResponse.json(serializeBigInt({
        success: true,
        data: { totalAmount: Number(total.toFixed(2)), count: rows.length, summary, rows: rows.slice(0, 500) },
      }));
    }

    // replenish
    const inventories = await prisma.inventory.findMany({
      include: {
        product: { select: { code: true, name: true, safetyStock: true, maxStock: true, defaultCost: true } },
        warehouse: { select: { name: true } },
      },
    });

    const rows = inventories
      .map((inv) => {
        const onHand = Number(inv.onHand || 0);
        const safety = Number(inv.product?.safetyStock || 0);
        const maxStock = Number(inv.product?.maxStock || 0);
        if (safety <= 0 || onHand > safety) return null;
        const target = maxStock > safety ? maxStock : safety * 2;
        const suggest = Math.max(0, Number((target - onHand).toFixed(3)));
        return {
          productCode: inv.product?.code || '-',
          productName: inv.product?.name || '-',
          warehouseName: inv.warehouse?.name || '-',
          onHand,
          safetyStock: safety,
          maxStock: maxStock || null,
          suggestQty: suggest,
          estCost: Number((suggest * Number(inv.product?.defaultCost || 0)).toFixed(2)),
          urgency: onHand <= 0 ? '缺货' : onHand <= safety * 0.5 ? '紧急' : '偏低',
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.onHand - b.onHand);

    return NextResponse.json(serializeBigInt({
      success: true,
      data: { count: rows.length, rows: (rows as any[]).slice(0, 500) },
    }));
  } catch (error) {
    return authErrorResponse(error);
  }
}
