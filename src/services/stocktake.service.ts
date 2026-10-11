import { prisma } from '@/lib/prisma';
import { generateOrderNo } from '@/lib/utils';
import { NotFoundError, InvalidStateError } from '@/lib/errors';
import { ORDER_STATUS } from '@/lib/constants';
import { Prisma } from '@prisma/client';

/**
 * 盘点服务
 * 处理盘点单的创建、录入实盘数量、结算等操作
 */
export class StocktakeService {
  /**
   * 盘点单列表
   */
  static async list(params: {
    page: number;
    pageSize: number;
    status?: string;
    warehouseId?: number;
    type?: string;
  }) {
    const { page, pageSize, status, warehouseId, type } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CountOrderWhereInput = {};
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (type) where.type = type;

    const [list, total] = await Promise.all([
      prisma.countOrder.findMany({
        where,
        include: {
          countItems: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.countOrder.count({ where }),
    ]);

    return {
      list: list.map((o) => ({
        ...o,
        id: Number(o.id),
        items: o.countItems.map((item) => ({
          ...item,
          id: Number(item.id),
          productId: Number(item.productId),
          systemQty: Number(item.systemQty),
          countQty: item.countQty ? Number(item.countQty) : null,
          diffQty: item.diffQty ? Number(item.diffQty) : null,
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取盘点单详情
   */
  static async getById(id: number) {
    const order = await prisma.countOrder.findUnique({
      where: { id },
      include: {
        countItems: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
        countAdjustments: true,
      },
    });

    if (!order) throw new NotFoundError('盘点单', id);
    return order;
  }

  /**
   * 创建盘点单
   * 自动读取系统库存作为账面数量
   */
  static async create(data: {
    warehouseId: number;
    type: string;
    remark?: string;
    items: {
      productId: number;
      skuVariantId?: number;
    }[];
    operatorId?: number;
  }) {
    const orderNo = await generateOrderNo('CK', prisma);

    // 查询系统库存
    const countItems = await Promise.all(
      data.items.map(async (item) => {
        const inv = await prisma.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: data.warehouseId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });

        return {
          productId: item.productId,
          skuVariantId: item.skuVariantId,
          systemQty: inv ? new Prisma.Decimal(inv.onHand) : new Prisma.Decimal(0),
        };
      }),
    );

    const order = await prisma.countOrder.create({
      data: {
        orderNo,
        warehouseId: data.warehouseId,
        type: data.type,
        status: ORDER_STATUS.DRAFT,
        remark: data.remark,
        operatorId: data.operatorId,
        countItems: {
          create: countItems,
        },
      },
      include: { countItems: true },
    });

    return order;
  }

  /**
   * 开始盘点（状态变更）
   */
  static async start(id: number) {
    const order = await prisma.countOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('盘点单', id);
    // 已经是盘点中，直接返回成功
    if (order.status === ORDER_STATUS.COUNTING) {
      return order;
    }
    if (order.status !== ORDER_STATUS.DRAFT) {
      throw new InvalidStateError(order.status, '开始盘点');
    }

    return prisma.countOrder.update({
      where: { id },
      data: { status: ORDER_STATUS.COUNTING },
    });
  }

  /**
   * 录入实盘数量
   */
  static async enterCount(id: number, entries: { id: number; countQty: number; remark?: string }[]) {
    const order = await prisma.countOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('盘点单', id);
    // 如果是草稿状态，自动开始盘点
    if (order.status === ORDER_STATUS.DRAFT) {
      await prisma.countOrder.update({
        where: { id },
        data: { status: ORDER_STATUS.COUNTING },
      });
    } else if (order.status !== ORDER_STATUS.COUNTING) {
      throw new InvalidStateError(order.status, '录入实盘');
    }

    // 先查出所有要更新的条目，获取系统数量
    // 注意：id 是 BigInt，Map 键必须统一转 Number，否则 JSON 传入的 Number id 永远匹配不到（静默跳过）
    const itemIds = entries.map(e => Number(e.id));
    const existingItems = await prisma.countItem.findMany({
      where: { id: { in: itemIds } },
    });
    const itemMap = new Map(existingItems.map(i => [Number(i.id), i]));

    // 批量更新实盘数量和差异
    for (const entry of entries) {
      const item = itemMap.get(Number(entry.id));
      if (!item) continue;
      const systemQty = Number(item.systemQty || 0);
      const diff = entry.countQty - systemQty;
      await prisma.countItem.update({
        where: { id: entry.id },
        data: {
          countQty: new Prisma.Decimal(entry.countQty),
          diffQty: new Prisma.Decimal(diff),
          remark: entry.remark || null,
        },
      });
    }

    return { success: true };
  }

  /**
   * 盘点结算（生成调整单，更新库存）
   */
  static async settle(id: number, operatorId?: number, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.countOrder.findUnique({
        where: { id },
        include: { countItems: true },
      });

      if (!order) throw new NotFoundError('盘点单', id);
      if (order.status !== ORDER_STATUS.COUNTING) {
        throw new InvalidStateError(order.status, '结算');
      }

      const now = new Date();

      for (const item of order.countItems) {
        if (item.countQty === null) continue; // 未录入的跳过

        const systemQty = Number(item.systemQty);
        const countQty = Number(item.countQty);
        const diff = countQty - systemQty;

        if (diff === 0) continue; // 无差异跳过

        // 创建调整记录
        await tx.countAdjustment.create({
          data: {
            orderId: order.id,
            productId: item.productId,
            warehouseId: order.warehouseId,
            adjustQty: new Prisma.Decimal(Math.abs(diff)),
            adjustType: diff > 0 ? 'INCREASE' : 'DECREASE',
            remark: `盘点调整: 系统${systemQty} → 实盘${countQty}`,
          },
        });

        // 更新库存
        if (diff > 0) {
          // 盘盈：增加库存
          await tx.inventory.update({
            where: {
              productId_warehouseId_skuVariantId: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                skuVariantId: item.skuVariantId || 0,
              },
            },
            data: {
              onHand: { increment: diff },
              version: { increment: 1 },
            },
          });
        } else {
          // 盘亏：减少库存
          await tx.inventory.update({
            where: {
              productId_warehouseId_skuVariantId: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                skuVariantId: item.skuVariantId || 0,
              },
            },
            data: {
              onHand: { decrement: Math.abs(diff) },
              version: { increment: 1 },
            },
          });
        }

        // 写库存流水
        await tx.inventoryTransaction.create({
          data: {
            txnType: 'ADJUST',
            refType: 'COUNT',
            refId: order.id,
            refNo: order.orderNo,
            productId: item.productId,
            warehouseId: order.warehouseId,
            skuVariantId: item.skuVariantId,
            quantity: diff,
            beforeQty: systemQty,
            afterQty: countQty,
            operatorId,
            txnTime: now,
            remark: `盘点调整`,
          },
        });
      }

      // 更新盘点单状态
      await tx.countOrder.update({
        where: { id },
        data: {
          status: ORDER_STATUS.ADJUSTED,
          adjustedAt: now,
        },
      });

      // 审计日志
      await tx.operationLog.create({
        data: {
          userId: operatorId,
          module: 'STOCKTAKE',
          action: 'SETTLE',
          refType: 'COUNT',
          refId: order.id,
          content: `盘点单 ${order.orderNo} 已结算`,
          ip: ip || null,
        },
      });

      return { orderNo: order.orderNo, status: ORDER_STATUS.ADJUSTED };
    });
  }
}
