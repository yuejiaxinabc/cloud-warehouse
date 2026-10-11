import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * 库存服务
 * 处理库存查询、可用量计算等
 */
export class InventoryService {
  /**
   * 查询库存余额列表
   */
  static async list(params: {
    page: number;
    pageSize: number;
    warehouseId?: number;
    categoryId?: number;
    keyword?: string;
    lowStockOnly?: boolean;
  }) {
    const { page, pageSize, warehouseId, categoryId, keyword, lowStockOnly } = params;
    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const inventoryWhere: Prisma.InventoryWhereInput = {};
    if (warehouseId) inventoryWhere.warehouseId = warehouseId;

    // 低库存筛选：onHand <= safetyStock
    if (lowStockOnly) {
      inventoryWhere.product = {
        safetyStock: { not: null },
      };
    }

    const productWhere: Prisma.ProductWhereInput = { status: 1 };
    if (categoryId) productWhere.categoryId = categoryId;
    if (keyword) {
      productWhere.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    if (Object.keys(productWhere).length > 1 || keyword || categoryId) {
      inventoryWhere.product = { ...inventoryWhere.product, ...productWhere };
    }

    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where: inventoryWhere,
        include: {
          product: {
            include: {
              category: { select: { id: true, name: true } },
              unit: { select: { id: true, name: true } },
            },
          },
          warehouse: { select: { id: true, name: true, code: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.inventory.count({ where: inventoryWhere }),
    ]);

    const list = inventories.map((inv) => {
      const onHand = Number(inv.onHand);
      const locked = Number(inv.locked);
      const available = onHand - locked;
      const avgCost = inv.avgCost ? Number(inv.avgCost) : 0;

      return {
        id: Number(inv.id),
        productId: Number(inv.product.id),
        productName: inv.product.name,
        productCode: inv.product.code,
        category: inv.product.category,
        unit: inv.product.unit,
        warehouseId: Number(inv.warehouse.id),
        warehouseName: inv.warehouse.name,
        warehouseCode: inv.warehouse.code,
        skuVariantId: inv.skuVariantId ? Number(inv.skuVariantId) : null,
        onHand,
        locked,
        available,
        avgCost,
        totalValue: onHand * avgCost,
        safetyStock: inv.product.safetyStock ? Number(inv.product.safetyStock) : null,
        maxStock: inv.product.maxStock ? Number(inv.product.maxStock) : null,
        version: inv.version,
        updatedAt: inv.updatedAt,
      };
    });

    // 低库存过滤：实际在手量 <= 安全库存
    const filteredList = lowStockOnly
      ? list.filter((item) => item.safetyStock !== null && item.onHand <= item.safetyStock!)
      : list;

    return {
      list: filteredList,
      total: lowStockOnly ? filteredList.length : total,
      page,
      pageSize,
      totalPages: Math.ceil((lowStockOnly ? filteredList.length : total) / pageSize),
    };
  }

  /**
   * 查询某个商品在所有仓库的库存汇总
   */
  static async getProductStock(productId: number) {
    const inventories = await prisma.inventory.findMany({
      where: { productId },
      include: {
        warehouse: { select: { id: true, name: true } },
      },
    });

    let totalOnHand = 0;
    let totalLocked = 0;
    let totalValue = 0;

    const details = inventories.map((inv) => {
      const onHand = Number(inv.onHand);
      const locked = Number(inv.locked);
      const avgCost = inv.avgCost ? Number(inv.avgCost) : 0;

      totalOnHand += onHand;
      totalLocked += locked;
      totalValue += onHand * avgCost;

      return {
        warehouseId: Number(inv.warehouse.id),
        warehouseName: inv.warehouse.name,
        onHand,
        locked,
        available: onHand - locked,
        avgCost,
      };
    });

    return {
      productId,
      totalOnHand,
      totalLocked,
      totalAvailable: totalOnHand - totalLocked,
      totalValue,
      warehouses: details,
    };
  }

  /**
   * 获取可用量（用于出库前校验）
   * 可用量 = 在手量 - 锁定量
   */
  static async getAvailableQty(
    productId: number,
    warehouseId: number,
    skuVariantId?: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx || prisma;
    const inv = await client.inventory.findUnique({
      where: {
        productId_warehouseId_skuVariantId: {
          productId,
          warehouseId,
          skuVariantId: skuVariantId || 0,
        },
      },
    });

    if (!inv) return 0;
    return Number(inv.onHand) - Number(inv.locked);
  }

  /**
   * 锁定库存（出库审批通过后锁定）
   */
  static async lockStock(
    productId: number,
    warehouseId: number,
    quantity: number,
    tx: Prisma.TransactionClient,
  ) {
    const inv = await tx.inventory.findUnique({
      where: {
        productId_warehouseId_skuVariantId: {
          productId,
          warehouseId,
          skuVariantId: 0,
        },
      },
    });

    if (!inv) throw new Error(`商品(${productId})在仓库(${warehouseId})无库存记录`);

    const available = Number(inv.onHand) - Number(inv.locked);
    if (available < quantity) {
      throw new Error(`库存不足，可用: ${available}，需要: ${quantity}`);
    }

    return tx.inventory.update({
      where: { id: inv.id },
      data: {
        locked: { increment: quantity },
        version: { increment: 1 },
      },
    });
  }

  /**
   * 解锁库存
   */
  static async unlockStock(
    productId: number,
    warehouseId: number,
    quantity: number,
    tx: Prisma.TransactionClient,
  ) {
    const inv = await tx.inventory.findUnique({
      where: {
        productId_warehouseId_skuVariantId: {
          productId,
          warehouseId,
          skuVariantId: 0,
        },
      },
    });

    if (!inv) throw new Error(`商品(${productId})在仓库(${warehouseId})无库存记录`);

    return tx.inventory.update({
      where: { id: inv.id },
      data: {
        locked: { decrement: quantity },
        version: { increment: 1 },
      },
    });
  }

  /**
   * 查询库存流水
   */
  static async getTransactions(params: {
    page: number;
    pageSize: number;
    productId?: number;
    warehouseId?: number;
    txnType?: string;
    refType?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page, pageSize, productId, warehouseId, txnType, refType, startDate, endDate } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.InventoryTransactionWhereInput = {};
    if (productId) where.productId = productId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (txnType) where.txnType = txnType;
    if (refType) where.refType = refType;
    if (startDate || endDate) {
      where.txnTime = {};
      if (startDate) where.txnTime.gte = new Date(startDate);
      if (endDate) where.txnTime.lte = new Date(endDate);
    }

    const [list, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        orderBy: { txnTime: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);

    return {
      list: list.map((t) => ({
        ...t,
        id: Number(t.id),
        productId: Number(t.productId),
        warehouseId: Number(t.warehouseId),
        quantity: Number(t.quantity),
        costPrice: t.costPrice ? Number(t.costPrice) : null,
        beforeQty: t.beforeQty ? Number(t.beforeQty) : null,
        afterQty: t.afterQty ? Number(t.afterQty) : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
