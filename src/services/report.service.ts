import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { roundMoney, roundQty } from '@/lib/utils';

/**
 * 报表服务
 * 收发存报表、周转率、呆滞分析
 *
 * 金额口径（v1.2.4 B 统一）：
 *  - 期间出/入库金额优先用流水/单据行上真实的 costPrice（或已存的 amount）；
 *  - costPrice 为空时才回落到「有效成本」= 该商品在库加权平均成本，
 *    再回落到商品 defaultCost；
 *  - 数量非 0 且有效成本 > 0 时，金额一定非 0（此前收发存出库金额恒为 0，
 *    就是因为出库循环只累加了数量、没累加金额；report.service 里则是
 *    defaultCost 为 0 时金额直接归零）。
 */
export class ReportService {
  /** 有效成本：库存加权平均成本优先，否则商品默认成本 */
  private static effectiveCost(
    inventories: { onHand: unknown; avgCost: unknown }[],
    defaultCost: number,
  ): number {
    let qty = 0;
    let value = 0;
    for (const inv of inventories) {
      const q = Number(inv.onHand || 0);
      const c = Number(inv.avgCost || 0);
      qty += q;
      value += q * c;
    }
    if (qty > 0 && value > 0) return value / qty;
    return defaultCost > 0 ? defaultCost : 0;
  }

  /**
   * 收发存报表
   * 统计指定时间段内各商品的期初、收入、发出、结存
   */
  static async stockMovement(params: {
    period: string; // YYYY-MM
    warehouseId?: number;
    categoryId?: number;
    productId?: number;
  }) {
    const { period, warehouseId, categoryId, productId } = params;
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 获取商品列表
    const productWhere: Prisma.ProductWhereInput = { status: 1 };
    if (categoryId) productWhere.categoryId = categoryId;
    if (productId) productWhere.id = productId;

    const products = await prisma.product.findMany({
      where: productWhere,
      include: { unit: { select: { name: true } } },
    });

    const results = [];

    for (const product of products) {
      // 本期出/入库流水（带真实成本价；出库流水 quantity 记负数，取绝对值）
      const txns = await prisma.inventoryTransaction.findMany({
        where: {
          productId: product.id,
          txnType: { in: ['INBOUND', 'OUTBOUND'] },
          txnTime: { gte: startDate, lte: endDate },
          ...(warehouseId ? { warehouseId } : {}),
        },
        select: { txnType: true, quantity: true, costPrice: true },
      });

      // 当前库存（用于期末 + 有效成本）
      const currentInvs = await prisma.inventory.findMany({
        where: {
          productId: product.id,
          ...(warehouseId ? { warehouseId } : {}),
        },
        select: { onHand: true, avgCost: true },
      });
      const currentQty = roundQty(
        currentInvs.reduce((s, inv) => s + Number(inv.onHand || 0), 0),
      );
      const defaultCost = product.defaultCost ? Number(product.defaultCost) : 0;
      const effCost = this.effectiveCost(currentInvs, defaultCost);

      let inQty = 0;
      let inAmount = 0;
      let outQty = 0;
      let outAmount = 0;
      for (const txn of txns) {
        const qty = Math.abs(Number(txn.quantity || 0));
        if (qty <= 0) continue;
        const unitCost = txn.costPrice != null ? Number(txn.costPrice) : effCost;
        if (txn.txnType === 'INBOUND') {
          inQty += qty;
          inAmount += qty * unitCost;
        } else {
          outQty += qty;
          outAmount += qty * unitCost;
        }
      }
      inQty = roundQty(inQty);
      outQty = roundQty(outQty);

      // 期初 = 当前库存 - 本期入库 + 本期出库
      const beginQty = roundQty(currentQty - inQty + outQty);
      const endAmount = roundMoney(
        currentInvs.reduce((s, inv) => s + Number(inv.onHand || 0) * Number(inv.avgCost || 0), 0),
      );
      inAmount = roundMoney(inAmount);
      outAmount = roundMoney(outAmount);
      // 数量非 0 但金额为 0 的兜底：库存行 avgCost 全空时用有效成本补算，
      // 避免「有量无价」的口径错乱（有效成本为 0 时才是真正的 0 元，如赠品）。
      const endAmountFixed =
        currentQty > 0 && endAmount === 0 && effCost > 0
          ? roundMoney(currentQty * effCost)
          : endAmount;
      const beginAmount = roundMoney(Math.max(0, endAmountFixed - inAmount + outAmount));

      results.push({
        productId: Number(product.id),
        productName: product.name,
        productCode: product.code,
        unit: product.unit?.name || '',
        beginQty: Math.max(0, beginQty),
        beginAmount,
        inQty,
        inAmount,
        outQty,
        outAmount,
        endQty: currentQty,
        endAmount: endAmountFixed,
      });
    }

    return results;
  }

  /**
   * 周转率报表
   * 周转率 = 销售成本 / 平均库存
   * 周转天数 = 365 / 周转率
   */
  static async turnover(params: {
    period: string;
    warehouseId?: number;
    categoryId?: number;
  }) {
    const { period, warehouseId, categoryId } = params;
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const productWhere: Prisma.ProductWhereInput = { status: 1 };
    if (categoryId) productWhere.categoryId = categoryId;

    const products = await prisma.product.findMany({
      where: productWhere,
      include: { unit: { select: { name: true } } },
    });

    const results = [];

    for (const product of products) {
      // 本期出库数量
      const outAgg = await prisma.inventoryTransaction.aggregate({
        where: {
          productId: product.id,
          txnType: 'OUTBOUND',
          txnTime: { gte: startDate, lte: endDate },
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { quantity: true },
      });

      // 当前库存
      const invAgg = await prisma.inventory.aggregate({
        where: {
          productId: product.id,
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { onHand: true },
      });

      const outQty = Math.abs(Number(outAgg._sum.quantity || 0));
      const currentQty = Number(invAgg._sum.onHand || 0);
      const avgInventory = currentQty; // 简化：用期末库存近似平均库存
      // v1.2.4 B：出库成本不用只认 defaultCost——defaultCost 为 0 时出库金额
      // 会被算成 0（有量无价）；改用在库加权平均成本，仍为空才用 defaultCost。
      const invRows = await prisma.inventory.findMany({
        where: {
          productId: product.id,
          ...(warehouseId ? { warehouseId } : {}),
        },
        select: { onHand: true, avgCost: true },
      });
      const avgCost = this.effectiveCost(
        invRows,
        product.defaultCost ? Number(product.defaultCost) : 0,
      );

      const outCost = outQty * avgCost;
      const avgInventoryValue = avgInventory * avgCost;

      const turnoverRate = avgInventoryValue > 0 ? outCost / avgInventoryValue : 0;
      const turnoverDays = turnoverRate > 0 ? 30 / turnoverRate : 0; // 月度周转天数

      results.push({
        productId: Number(product.id),
        productName: product.name,
        productCode: product.code,
        unit: product.unit?.name || '',
        avgInventory,
        totalOutQty: outQty,
        totalOutCost: roundMoney(outCost),
        turnoverRate: Math.round(turnoverRate * 100) / 100,
        turnoverDays: Math.round(turnoverDays),
      });
    }

    // 按周转率降序排序
    results.sort((a, b) => b.turnoverRate - a.turnoverRate);

    return results;
  }

  /**
   * 呆滞分析
   * 识别长期未动销的商品
   */
  static async aging(params: {
    days: number; // 呆滞天数阈值
    warehouseId?: number;
    categoryId?: number;
  }) {
    const { days, warehouseId, categoryId } = params;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const productWhere: Prisma.ProductWhereInput = { status: 1 };
    if (categoryId) productWhere.categoryId = categoryId;

    const products = await prisma.product.findMany({
      where: productWhere,
    });

    const results = [];

    for (const product of products) {
      // 查询最后一次出库时间
      const lastOutbound = await prisma.inventoryTransaction.findFirst({
        where: {
          productId: product.id,
          txnType: 'OUTBOUND',
          ...(warehouseId ? { warehouseId } : {}),
        },
        orderBy: { txnTime: 'desc' },
        select: { txnTime: true },
      });

      // 查询最后一次入库时间
      const lastInbound = await prisma.inventoryTransaction.findFirst({
        where: {
          productId: product.id,
          txnType: 'INBOUND',
          ...(warehouseId ? { warehouseId } : {}),
        },
        orderBy: { txnTime: 'desc' },
        select: { txnTime: true },
      });

      const lastOutDate = lastOutbound?.txnTime;
      const lastInDate = lastInbound?.txnTime;

      // 判断是否呆滞：最后一次出库在阈值日期之前
      const idleDays = lastOutDate
        ? Math.floor((Date.now() - lastOutDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (idleDays >= days) {
        const inv = await prisma.inventory.aggregate({
          where: {
            productId: product.id,
            ...(warehouseId ? { warehouseId } : {}),
          },
          _sum: { onHand: true },
        });

        const qty = Number(inv._sum.onHand || 0);
        if (qty > 0) {
          // v1.2.4 B：呆滞金额同样用在库加权平均成本，defaultCost 为 0 时不再归零。
          const invRows = await prisma.inventory.findMany({
            where: {
              productId: product.id,
              ...(warehouseId ? { warehouseId } : {}),
            },
            select: { onHand: true, avgCost: true },
          });
          const avgCost = ReportService.effectiveCost(
            invRows,
            product.defaultCost ? Number(product.defaultCost) : 0,
          );
          results.push({
            productId: Number(product.id),
            productName: product.name,
            productCode: product.code,
            quantity: qty,
            lastInboundDate: lastInDate,
            lastOutboundDate: lastOutDate,
            idleDays,
            amount: qty * avgCost,
          });
        }
      }
    }

    // 按呆滞天数降序排序
    results.sort((a, b) => b.idleDays - a.idleDays);

    return results;
  }

  /**
   * 库存总览（Dashboard 数据）
   */
  static async dashboard(warehouseId?: number) {
    const where: Prisma.InventoryWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;

    // 总库存金额
    const inventories = await prisma.inventory.findMany({
      where,
      include: { product: { select: { defaultCost: true } } },
    });

    let totalValue = 0;
    let totalItems = 0;
    let lowStockCount = 0;

    for (const inv of inventories) {
      const onHand = Number(inv.onHand);
      if (onHand > 0) {
        totalItems++;
        const cost = inv.avgCost ? Number(inv.avgCost) : (inv.product.defaultCost ? Number(inv.product.defaultCost) : 0);
        totalValue += onHand * cost;
      }

      // 检查低库存
      const product = await prisma.product.findUnique({
        where: { id: inv.productId },
        select: { safetyStock: true },
      });
      if (product?.safetyStock && onHand <= Number(product.safetyStock)) {
        lowStockCount++;
      }
    }

    // 未读预警数
    const alertCount = await prisma.alert.count({
      where: { status: 'UNREAD' },
    });

    // 本月入出库统计
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthInbound = await prisma.inventoryTransaction.aggregate({
      where: {
        txnType: 'INBOUND',
        txnTime: { gte: monthStart },
        ...(warehouseId ? { warehouseId } : {}),
      },
      _sum: { quantity: true },
      _count: true,
    });

    const monthOutbound = await prisma.inventoryTransaction.aggregate({
      where: {
        txnType: 'OUTBOUND',
        txnTime: { gte: monthStart },
        ...(warehouseId ? { warehouseId } : {}),
      },
      _sum: { quantity: true },
      _count: true,
    });

    return {
      totalValue: Math.round(totalValue * 100) / 100,
      totalItems,
      lowStockCount,
      alertCount,
      monthInboundQty: Number(monthInbound._sum.quantity || 0),
      monthInboundCount: monthInbound._count,
      monthOutboundQty: Math.abs(Number(monthOutbound._sum.quantity || 0)),
      monthOutboundCount: monthOutbound._count,
    };
  }
}
