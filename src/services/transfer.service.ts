import { prisma } from '@/lib/prisma';
import { generateOrderNo } from '@/lib/utils';
import { NotFoundError, InvalidStateError, InsufficientStockError, ForbiddenError } from '@/lib/errors';
import { ORDER_STATUS } from '@/lib/constants';
import { Prisma } from '@prisma/client';

/**
 * 调拨服务 - 重构版
 * 统一所有调拨业务逻辑，路由层只做参数校验和调用
 */
export class TransferService {
  /** 通用查询：包含 items + product + 仓库名称 */
  private static readonly includeRelations = {
    transferItems: {
      include: {
        product: { select: { id: true, name: true, code: true, unit: true } },
      },
    },
  };

  /** 填充仓库名称 */
  private static async fillWarehouseNames<T extends { fromWhId: any; toWhId: any }>(
    order: T
  ): Promise<T & { fromWarehouse: any; toWarehouse: any }> {
    const [fromWh, toWh] = await Promise.all([
      prisma.warehouse.findUnique({ where: { id: order.fromWhId }, select: { id: true, name: true, code: true } }),
      prisma.warehouse.findUnique({ where: { id: order.toWhId }, select: { id: true, name: true, code: true } }),
    ]);
    return {
      ...order,
      fromWarehouse: fromWh || { id: order.fromWhId, name: '未知仓库', code: '-' },
      toWarehouse: toWh || { id: order.toWhId, name: '未知仓库', code: '-' },
    };
  }

  /** 批量填充仓库名称（列表用） */
  private static async fillWarehouseNamesBatch<T extends { fromWhId: any; toWhId: any }>(
    orders: T[]
  ): Promise<(T & { fromWarehouse: any; toWarehouse: any })[]> {
    if (orders.length === 0) return [];
    const warehouseIds = [...new Set(orders.flatMap(o => [Number(o.fromWhId), Number(o.toWhId)]))];
    const warehouses = await prisma.warehouse.findMany({
      where: { id: { in: warehouseIds } },
      select: { id: true, name: true, code: true },
    });
    const whMap = new Map(warehouses.map(w => [Number(w.id), w]));
    return orders.map(o => ({
      ...o,
      fromWarehouse: whMap.get(Number(o.fromWhId)) || { id: o.fromWhId, name: '未知仓库', code: '-' },
      toWarehouse: whMap.get(Number(o.toWhId)) || { id: o.toWhId, name: '未知仓库', code: '-' },
    }));
  }

  /** 序列化 BigInt → number/字符串 */
  private static serialize<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
  }

  // ==================== 查询 ====================

  /**
   * 调拨单列表
   */
  static async list(params: {
    page: number;
    pageSize: number;
    status?: string;
    fromWhId?: number;
    toWhId?: number;
    keyword?: string;
  }) {
    const { page, pageSize, status, fromWhId, toWhId, keyword } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.TransferOrderWhereInput = {};
    if (status) where.status = status;
    if (fromWhId) where.fromWhId = fromWhId;
    if (toWhId) where.toWhId = toWhId;
    if (keyword) where.orderNo = { contains: keyword };

    const [orders, total] = await Promise.all([
      prisma.transferOrder.findMany({
        where,
        include: this.includeRelations,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.transferOrder.count({ where }),
    ]);

    const enriched = await this.fillWarehouseNamesBatch(orders);

    return this.serialize({
      list: enriched.map(o => ({
        ...o,
        id: Number(o.id),
        fromWhId: Number(o.fromWhId),
        toWhId: Number(o.toWhId),
        items: o.transferItems.map(item => ({
          ...item,
          id: Number(item.id),
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          sentQty: item.sentQty ? Number(item.sentQty) : null,
          receivedQty: item.receivedQty ? Number(item.receivedQty) : null,
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  }

  /**
   * 调拨单详情
   */
  static async getById(id: number) {
    const order = await prisma.transferOrder.findUnique({
      where: { id },
      include: this.includeRelations,
    });

    if (!order) throw new NotFoundError('调拨单', id);

    const enriched = await this.fillWarehouseNames(order);
    return this.serialize(enriched);
  }

  // ==================== 创建 ====================

  /**
   * 创建调拨单
   */
  static async create(data: {
    fromWhId: number;
    toWhId: number;
    remark?: string;
    items: { productId: number; skuVariantId?: number; quantity: number; remark?: string }[];
    operatorId?: number;
  }) {
    if (data.fromWhId === data.toWhId) {
      throw new Error('源仓库和目标仓库不能相同');
    }
    if (!data.items || data.items.length === 0) {
      throw new Error('至少需要一个调拨商品');
    }

    // 校验仓库存在
    const [fromWh, toWh] = await Promise.all([
      prisma.warehouse.findUnique({ where: { id: data.fromWhId } }),
      prisma.warehouse.findUnique({ where: { id: data.toWhId } }),
    ]);
    if (!fromWh) throw new NotFoundError('源仓库', data.fromWhId);
    if (!toWh) throw new NotFoundError('目标仓库', data.toWhId);

    const orderNo = await generateOrderNo('TR', prisma);

    const order = await prisma.transferOrder.create({
      data: {
        orderNo,
        fromWhId: data.fromWhId,
        toWhId: data.toWhId,
        status: ORDER_STATUS.DRAFT,
        remark: data.remark,
        operatorId: data.operatorId,
        transferItems: {
          create: data.items.map(item => ({
            productId: item.productId,
            skuVariantId: item.skuVariantId,
            quantity: new Prisma.Decimal(item.quantity),
            remark: item.remark,
          })),
        },
      },
      include: this.includeRelations,
    });

    return this.serialize(order);
  }

  // ==================== 状态变更 ====================

  /**
   * 发出调拨（从源仓库扣减库存）
   */
  static async send(id: number, operatorId?: number, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.transferOrder.findUnique({
        where: { id },
        include: { transferItems: true },
      });

      if (!order) throw new NotFoundError('调拨单', id);
      if (order.status !== ORDER_STATUS.DRAFT) {
        throw new InvalidStateError(order.status, '发出');
      }

      const now = new Date();

      for (const item of order.transferItems) {
        const qty = Number(item.quantity);

        // 校验源仓库库存
        const inv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: order.fromWhId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });

        if (!inv) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          throw new InsufficientStockError(product?.name || `商品(${item.productId})`, qty, 0);
        }

        const available = Number(inv.onHand) - Number(inv.locked);
        if (available < qty) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          throw new InsufficientStockError(product?.name || `商品(${item.productId})`, qty, available);
        }

        // 从源仓库扣减库存
        const beforeQty = Number(inv.onHand);
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            onHand: { decrement: qty },
            version: { increment: 1 },
          },
        });

        // 扣减货位库存（按先进先出）
        let remainQty = qty;
        const locStocks = await tx.locationStock.findMany({
          where: { inventoryId: inv.id, productId: item.productId, warehouseId: order.fromWhId },
          orderBy: { createdAt: 'asc' },
        });
        for (const ls of locStocks) {
          if (remainQty <= 0) break;
          const lsQty = Number(ls.quantity);
          const deduct = Math.min(remainQty, lsQty);
          if (lsQty - deduct <= 0) {
            await tx.locationStock.delete({ where: { id: ls.id } });
          } else {
            await tx.locationStock.update({ where: { id: ls.id }, data: { quantity: lsQty - deduct } });
          }
          remainQty -= deduct;
        }

        // 写流水（调拨出）
        await tx.inventoryTransaction.create({
          data: {
            txnType: 'TRANSFER',
            refType: 'TRANSFER',
            refId: order.id,
            refNo: order.orderNo,
            productId: item.productId,
            warehouseId: order.fromWhId,
            skuVariantId: item.skuVariantId,
            quantity: -qty,
            beforeQty,
            afterQty: beforeQty - qty,
            operatorId,
            txnTime: now,
            remark: `调拨发出 → 仓库${order.toWhId}`,
          },
        });

        // 更新发出数量
        await tx.transferItem.update({
          where: { id: item.id },
          data: { sentQty: new Prisma.Decimal(qty) },
        });
      }

      await tx.transferOrder.update({
        where: { id },
        data: { status: ORDER_STATUS.SENT, sentAt: now },
      });

      await tx.operationLog.create({
        data: {
          userId: operatorId,
          module: 'TRANSFER',
          action: 'SEND',
          refType: 'TRANSFER',
          refId: order.id,
          content: `调拨单 ${order.orderNo} 已发出`,
          ip: ip || null,
        },
      });

      return this.serialize({ orderNo: order.orderNo, status: ORDER_STATUS.SENT });
    });
  }

  /**
   * 接收调拨（目标仓库增加库存）
   */
  static async receive(
    id: number,
    operatorId?: number,
    ip: string | undefined,
    locations?: { productId: number; locationId: number; boxId?: number; quantity: number }[]
  ) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.transferOrder.findUnique({
        where: { id },
        include: { transferItems: true },
      });

      if (!order) throw new NotFoundError('调拨单', id);
      if (order.status !== ORDER_STATUS.SENT) {
        throw new InvalidStateError(order.status, '接收');
      }

      const now = new Date();

      for (const item of order.transferItems) {
        const qty = Number(item.sentQty || item.quantity);

        // 查询目标仓库库存
        const existingInv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: order.toWhId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });

        let invId: bigint;
        let beforeQty: number;

        // 获取源仓库成本价
        const sourceInv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: order.fromWhId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });
        const sourceCost = sourceInv?.avgCost ? Number(sourceInv.avgCost) : null;

        if (existingInv) {
          beforeQty = Number(existingInv.onHand);
          // 移动加权平均计算新成本
          const oldCost = Number(existingInv.avgCost || 0);
          const oldQty = beforeQty;
          const newAvgCost = sourceCost
            ? ((oldCost * oldQty) + (sourceCost * qty)) / (oldQty + qty)
            : existingInv.avgCost;
          await tx.inventory.update({
            where: { id: existingInv.id },
            data: {
              onHand: { increment: qty },
              avgCost: newAvgCost,
              version: { increment: 1 },
            },
          });
          invId = existingInv.id;
        } else {
          beforeQty = 0;
          const newInv = await tx.inventory.create({
            data: {
              productId: item.productId,
              warehouseId: order.toWhId,
              skuVariantId: item.skuVariantId || 0,
              onHand: qty,
              avgCost: sourceCost || 0,
              locked: 0,
              version: 0,
            },
          });
          invId = newInv.id;
        }

        // 写流水（调拨入）
        await tx.inventoryTransaction.create({
          data: {
            txnType: 'TRANSFER',
            refType: 'TRANSFER',
            refId: order.id,
            refNo: order.orderNo,
            productId: item.productId,
            warehouseId: order.toWhId,
            skuVariantId: item.skuVariantId,
            quantity: qty,
            beforeQty,
            afterQty: beforeQty + qty,
            operatorId,
            txnTime: now,
            remark: `调拨接收 ← 仓库${order.fromWhId}`,
          },
        });

        // 分配货位
        const matchedLoc = locations && locations.length > 0
          ? locations.find(l => Number(l.productId) === Number(item.productId))
          : null;

        if (matchedLoc) {
          // 用户指定了货位
          await tx.locationStock.create({
            data: {
              inventoryId: invId,
              productId: item.productId,
              warehouseId: order.toWhId,
              locationId: Number(matchedLoc.locationId),
              boxId: matchedLoc.boxId ? Number(matchedLoc.boxId) : null,
              quantity: qty,
            },
          });
        } else {
          // 未指定货位：优先加到该商品在目标仓库已有的货位
          const existingLocStock = await tx.locationStock.findFirst({
            where: { inventoryId: invId, productId: item.productId, warehouseId: order.toWhId },
            orderBy: { updatedAt: 'desc' },
          });
          if (existingLocStock) {
            await tx.locationStock.update({
              where: { id: existingLocStock.id },
              data: { quantity: { increment: qty } },
            });
          } else {
            // 没有已有货位，找一个空货位（没有其他商品的）
            const occupiedLocIds = await tx.locationStock.findMany({
              where: { warehouseId: order.toWhId },
              select: { locationId: true },
              distinct: ['locationId'],
            });
            const occupiedIds = occupiedLocIds.map((ls: any) => ls.locationId);
            const defaultLoc = await tx.location.findFirst({
              where: {
                zone: { warehouseId: order.toWhId },
                status: 1,
                id: { notIn: occupiedIds.length > 0 ? occupiedIds : [0n] },
              },
              orderBy: { id: 'asc' },
            });
            if (defaultLoc) {
              await tx.locationStock.create({
                data: {
                  inventoryId: invId,
                  productId: item.productId,
                  warehouseId: order.toWhId,
                  locationId: defaultLoc.id,
                  quantity: qty,
                },
              });
            }
          }
        }

        // 更新接收数量
        await tx.transferItem.update({
          where: { id: item.id },
          data: { receivedQty: new Prisma.Decimal(qty) },
        });
      }

      await tx.transferOrder.update({
        where: { id },
        data: { status: ORDER_STATUS.RECEIVED, receivedAt: now },
      });

      await tx.operationLog.create({
        data: {
          userId: operatorId,
          module: 'TRANSFER',
          action: 'RECEIVE',
          refType: 'TRANSFER',
          refId: order.id,
          content: `调拨单 ${order.orderNo} 已接收`,
          ip: ip || null,
        },
      });

      return this.serialize({ orderNo: order.orderNo, status: ORDER_STATUS.RECEIVED });
    });
  }

  // ==================== 删除/取消 ====================

  /**
   * 取消调拨单（仅草稿状态可取消）
   */
  static async cancel(id: number, operatorId?: number, ip?: string) {
    const order = await prisma.transferOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('调拨单', id);
    if (order.status !== ORDER_STATUS.DRAFT) {
      throw new InvalidStateError(order.status, '取消');
    }

    await prisma.transferOrder.update({
      where: { id },
      data: { status: ORDER_STATUS.CANCELLED },
    });

    await prisma.operationLog.create({
      data: {
        userId: operatorId,
        module: 'TRANSFER',
        action: 'CANCEL',
        refType: 'TRANSFER',
        refId: order.id,
        content: `调拨单 ${order.orderNo} 已取消`,
          ip: ip || null,
      },
    });

    return this.serialize({ orderNo: order.orderNo, status: ORDER_STATUS.CANCELLED });
  }

  /**
   * 删除调拨单（仅草稿/已取消状态可删除）
   */
  static async remove(id: number, operatorId?: number, ip?: string) {
    const order = await prisma.transferOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('调拨单', id);

    const allowedStatuses = [ORDER_STATUS.DRAFT, ORDER_STATUS.CANCELLED];
    if (!allowedStatuses.includes(order.status)) {
      throw new InvalidStateError(order.status, '删除');
    }

    await prisma.transferOrder.delete({ where: { id } });

    await prisma.operationLog.create({
      data: {
        userId: operatorId,
        module: 'TRANSFER',
        action: 'DELETE',
        refType: 'TRANSFER',
        refId: order.id,
        content: `调拨单 ${order.orderNo} 已删除`,
          ip: ip || null,
      },
    });

    return this.serialize({ orderNo: order.orderNo });
  }
}
