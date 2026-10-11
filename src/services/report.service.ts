import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * 报表服务
 * 收发存报表、周转率、呆滞分析
 */
export class ReportService {
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
      // 查询入库总量
      const inbounds = await prisma.inventoryTransaction.aggregate({
        where: {
          productId: product.id,
          txnType: 'INBOUND',
          txnTime: { gte: startDate, lte: endDate },
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { quantity: true },
      });

      // 查询出库总量
      const outbounds = await prisma.inventoryTransaction.aggregate({
        where: {
          productId: product.id,
          txnType: 'OUTBOUND',
          txnTime: { gte: startDate, lte: endDate },
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { quantity: true },
      });

      // 期初 = 当前库存 - 本期入库 + 本期出库
      const currentInv = await prisma.inventory.aggregate({
        where: {
          productId: product.id,
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { onHand: true },
      });

      const inQty = Number(inbounds._sum.quantity || 0);
      const outQty = Math.abs(Number(outbounds._sum.quantity || 0));
      const currentQty = Number(currentInv._sum.onHand || 0);
      const beginQty = currentQty - inQty + outQty;

      // 成本计算（简化：使用移动平均）
      const avgCost = product.defaultCost ? Number(product.defaultCost) : 0;

      results.push({
        productId: Number(product.id),
        productName: product.name,
        productCode: product.code,
        unit: product.unit?.name || '',
        beginQty,
        beginAmount: beginQty * avgCost,
        inQty,
        inAmount: inQty * avgCost,
        outQty,
        outAmount: outQty * avgCost,
        endQty: currentQty,
        endAmount: currentQty * avgCost,
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
      const avgCost = product.defaultCost ? Number(product.defaultCost) : 0;

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
          const avgCost = product.defaultCost ? Number(product.defaultCost) : 0;
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
