import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/**
 * GET /api/v1/mp/dashboard - 首页数据看板
 * 聚合口径与 Web 端工作台完全一致：
 * - 库存统计：sum(onHand)、sum(onHand*avgCost)、库存条目数
 * - 仓库分布：各仓 SKU 条目/数量/货值
 * - 7日趋势：inventoryTransaction 按 INBOUND/OUTBOUND/TRANSFER 按日汇总
 * - 待处理：DRAFT 状态的入库/出库/调拨单数
 */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);

    // 1. 库存统计 + 仓库分布（与 Web 相同的聚合口径）
    const inventories = await prisma.inventory.findMany({
      select: { warehouseId: true, onHand: true, avgCost: true },
    });
    let totalQty = 0;
    let totalValue = 0;
    const whAcc = new Map<number, { products: number; totalQty: number; totalValue: number }>();
    for (const inv of inventories) {
      const onHand = Number(inv.onHand) || 0;
      const cost = Number(inv.avgCost) || 0;
      totalQty += onHand;
      totalValue += onHand * cost;
      const key = Number(inv.warehouseId);
      const acc = whAcc.get(key) || { products: 0, totalQty: 0, totalValue: 0 };
      acc.products += 1;
      acc.totalQty += onHand;
      acc.totalValue += onHand * cost;
      whAcc.set(key, acc);
    }

    const warehouses = await prisma.warehouse.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { id: 'asc' },
    });
    const warehouseValues = warehouses.map((w) => {
      const acc = whAcc.get(Number(w.id)) || { products: 0, totalQty: 0, totalValue: 0 };
      return {
        warehouseId: Number(w.id),
        name: w.name,
        code: w.code,
        products: acc.products,
        totalQty: acc.totalQty,
        totalValue: Math.round(acc.totalValue * 100) / 100,
      };
    });

    // 2. 7 日趋势（与 Web /api/reports?type=trend&days=7 相同口径）
    const days = 7;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const txns = await prisma.inventoryTransaction.findMany({
      where: { createdAt: { gte: startDate } },
      select: { txnType: true, quantity: true, createdAt: true },
    });

    const dayMap: Record<string, { inbound: number; outbound: number; transfer: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = (d.getMonth() + 1) + '/' + d.getDate();
      dayMap[key] = { inbound: 0, outbound: 0, transfer: 0 };
    }
    for (const txn of txns) {
      const d = new Date(txn.createdAt);
      const key = (d.getMonth() + 1) + '/' + d.getDate();
      if (!dayMap[key]) continue;
      const qty = Math.abs(Number(txn.quantity));
      if (txn.txnType === 'INBOUND') dayMap[key].inbound += qty;
      else if (txn.txnType === 'OUTBOUND') dayMap[key].outbound += qty;
      else if (txn.txnType === 'TRANSFER') dayMap[key].transfer += qty;
    }
    const trend = Object.entries(dayMap).map(([date, v]) => ({
      date,
      inbound: Math.round(v.inbound * 100) / 100,
      outbound: Math.round(v.outbound * 100) / 100,
      transfer: Math.round(v.transfer * 100) / 100,
    }));

    // 3. 待处理单据（DRAFT）
    const [pendingInbound, pendingOutbound, pendingTransfer] = await Promise.all([
      prisma.inboundOrder.count({ where: { status: 'DRAFT' } }),
      prisma.outboundOrder.count({ where: { status: 'DRAFT' } }),
      prisma.transferOrder.count({ where: { status: 'DRAFT' } }).catch(() => 0),
    ]);

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        stats: {
          totalQty,
          totalValue: Math.round(totalValue * 100) / 100,
          totalItems: inventories.length,
        },
        warehouseValues,
        trend,
        pending: { inbound: pendingInbound, outbound: pendingOutbound, transfer: pendingTransfer },
      },
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
