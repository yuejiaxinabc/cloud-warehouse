import { prisma } from '@/lib/prisma';
import { getCurrentPeriod } from '@/lib/utils';
import { Prisma } from '@prisma/client';

/**
 * 成本核算服务
 * 支持移动加权平均、FIFO、月度加权平均三种方法
 */
export class CostService {
  /**
   * 移动加权平均法 - 入库时更新平均成本
   * 新平均成本 = (旧库存量 × 旧平均成本 + 新入库量 × 入库单价) / (旧库存量 + 新入库量)
   */
  static calcWeightedAverage(
    oldQty: number,
    oldAvgCost: number,
    inQty: number,
    inCost: number,
  ): number {
    if (inQty <= 0) return oldAvgCost;
    const totalQty = oldQty + inQty;
    if (totalQty <= 0) return 0;
    return (oldQty * oldAvgCost + inQty * inCost) / totalQty;
  }

  /**
   * FIFO 法 - 出库时按先入先出取成本
   * 返回各批次的出库成本明细
   */
  static calcFifoCost(
    lots: { lotNumber: string; quantity: number; costPrice: number }[],
    outQty: number,
  ): { lotNumber: string; quantity: number; costPrice: number }[] {
    const result: { lotNumber: string; quantity: number; costPrice: number }[] = [];
    let remaining = outQty;

    // lots 应该已按入库时间排序（先入先出）
    for (const lot of lots) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, lot.quantity);
      result.push({
        lotNumber: lot.lotNumber,
        quantity: deduct,
        costPrice: lot.costPrice,
      });
      remaining -= deduct;
    }

    return result;
  }

  /**
   * 月度加权平均法 - 月末计算当月平均成本
   * 月度平均成本 = (期初金额 + 本月入库金额) / (期初数量 + 本月入库数量)
   */
  static calcMonthlyAverage(
    beginQty: number,
    beginAmount: number,
    inQty: number,
    inAmount: number,
  ): number {
    const totalQty = beginQty + inQty;
    if (totalQty <= 0) return 0;
    return (beginAmount + inAmount) / totalQty;
  }

  /**
   * 生成成本快照（月结）
   * 统计指定月份的期初、入库、出库、结存
   */
  static async generateSnapshot(period?: string) {
    const targetPeriod = period || getCurrentPeriod();
    const [year, month] = targetPeriod.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const products = await prisma.product.findMany({
      where: { status: 1 },
    });

    const snapshots = [];

    for (const product of products) {
      // 查询上期快照作为期初
      const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${(month - 1).toString().padStart(2, '0')}`;
      const prevSnapshot = await prisma.costSnapshot.findFirst({
        where: {
          productId: product.id,
          period: prevMonth,
        },
      });

      const beginQty = prevSnapshot ? Number(prevSnapshot.endQty || 0) : 0;
      const beginAmount = prevSnapshot ? Number(prevSnapshot.endAmount || 0) : 0;

      // 本期入库
      const inAgg = await prisma.inventoryTransaction.aggregate({
        where: {
          productId: product.id,
          txnType: 'INBOUND',
          txnTime: { gte: startDate, lte: endDate },
        },
        _sum: { quantity: true },
      });

      // 本期出库
      const outAgg = await prisma.inventoryTransaction.aggregate({
        where: {
          productId: product.id,
          txnType: 'OUTBOUND',
          txnTime: { gte: startDate, lte: endDate },
        },
        _sum: { quantity: true },
      });

      const avgCost = product.defaultCost ? Number(product.defaultCost) : 0;
      const inQty = Number(inAgg._sum.quantity || 0);
      const outQty = Math.abs(Number(outAgg._sum.quantity || 0));
      const inAmount = inQty * avgCost;
      const outAmount = outQty * avgCost;

      const endQty = beginQty + inQty - outQty;
      const endAmount = beginAmount + inAmount - outAmount;

      const snapshot = await prisma.costSnapshot.upsert({
        where: {
          productId_warehouseId_period: {
            productId: product.id,
            warehouseId: 0,
            period: targetPeriod,
          },
        },
        update: {
          beginQty,
          beginAmount,
          inQty,
          inAmount,
          outQty,
          outAmount,
          endQty,
          endAmount,
          avgCost,
        },
        create: {
          productId: product.id,
          warehouseId: 0,
          period: targetPeriod,
          beginQty,
          beginAmount,
          inQty,
          inAmount,
          outQty,
          outAmount,
          endQty,
          endAmount,
          avgCost,
        },
      });

      snapshots.push({
        productId: Number(product.id),
        productName: product.name,
        period: targetPeriod,
        beginQty,
        beginAmount,
        inQty,
        inAmount,
        outQty,
        outAmount,
        endQty,
        endAmount,
        avgCost,
      });
    }

    return snapshots;
  }

  /**
   * 查询成本快照
   */
  static async getSnapshots(params: {
    period: string;
    productId?: number;
    warehouseId?: number;
  }) {
    const { period, productId, warehouseId } = params;

    const where: Prisma.CostSnapshotWhereInput = { period };
    if (productId) where.productId = productId;
    if (warehouseId) where.warehouseId = warehouseId;

    const snapshots = await prisma.costSnapshot.findMany({
      where,
      include: {
        product: { select: { name: true, code: true } },
      },
      orderBy: { productId: 'asc' },
    });

    return snapshots.map((s) => ({
      productId: Number(s.productId),
      productName: s.product.name,
      productCode: s.product.code,
      period: s.period,
      beginQty: s.beginQty ? Number(s.beginQty) : 0,
      beginAmount: s.beginAmount ? Number(s.beginAmount) : 0,
      inQty: s.inQty ? Number(s.inQty) : 0,
      inAmount: s.inAmount ? Number(s.inAmount) : 0,
      outQty: s.outQty ? Number(s.outQty) : 0,
      outAmount: s.outAmount ? Number(s.outAmount) : 0,
      endQty: s.endQty ? Number(s.endQty) : 0,
      endAmount: s.endAmount ? Number(s.endAmount) : 0,
      avgCost: s.avgCost ? Number(s.avgCost) : 0,
    }));
  }

  /**
   * 设置商品成本方法
   */
  static async setCostMethod(productId: number, costMethod: string, remark?: string) {
    return prisma.productCostSetting.upsert({
      where: { productId },
      update: { costMethod, remark },
      create: { productId, costMethod, remark },
    });
  }
}
