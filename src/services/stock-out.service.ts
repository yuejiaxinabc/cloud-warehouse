import { prisma } from '@/lib/prisma';
import { generateOrderNo } from '@/lib/utils';
import { NotFoundError, InvalidStateError, InsufficientStockError, ConflictError } from '@/lib/errors';
import { ORDER_STATUS } from '@/lib/constants';
import { Prisma } from '@prisma/client';

/**
 * 出库服务
 * 处理出库单的创建、锁定、过账等操作
 * 使用乐观锁防止超卖
 */
export class StockOutService {
  /**
   * 出库单列表
   */
  static async list(params: {
    page: number;
    pageSize: number;
    type?: string;
    status?: string;
    warehouseId?: number;
    keyword?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const { page, pageSize, type, status, warehouseId, keyword, startDate, endDate } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.OutboundOrderWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { customer: { name: { contains: keyword } } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [list, total] = await Promise.all([
      prisma.outboundOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, code: true } },
          outboundItems: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.outboundOrder.count({ where }),
    ]);

    return {
      list: list.map((o) => ({
        ...o,
        id: Number(o.id),
        customerId: o.customerId ? Number(o.customerId) : null,
        totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
        totalQty: o.totalQty ? Number(o.totalQty) : null,
        items: o.outboundItems.map((item) => ({
          ...item,
          id: Number(item.id),
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          pickedQty: item.pickedQty ? Number(item.pickedQty) : null,
          costPrice: item.costPrice ? Number(item.costPrice) : null,
          amount: item.amount ? Number(item.amount) : null,
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取出库单详情
   */
  static async getById(id: number) {
    const order = await prisma.outboundOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        outboundItems: {
          include: {
            product: { select: { id: true, name: true, code: true } },
            lotPicks: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundError('出库单', id);
    return order;
  }

  /**
   * 创建出库单
   */
  static async create(data: {
    type: string;
    warehouseId: number;
    customerId?: number;
    remark?: string;
    items: {
      productId: number;
      skuVariantId?: number;
      quantity: number;
      remark?: string;
    }[];
    operatorId?: number;
  }) {
    const orderNo = await generateOrderNo('OUT', prisma);

    let totalAmount = 0;
    let totalQty = 0;

    // 查询商品成本价
    const itemsData = await Promise.all(
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

        const costPrice = inv?.avgCost ? Number(inv.avgCost) : 0;
        const amount = item.quantity * costPrice;
        totalAmount += amount;
        totalQty += item.quantity;

        return {
          productId: item.productId,
          skuVariantId: item.skuVariantId,
          quantity: new Prisma.Decimal(item.quantity),
          costPrice: costPrice > 0 ? new Prisma.Decimal(costPrice) : null,
          amount: amount > 0 ? new Prisma.Decimal(amount) : null,
          remark: item.remark,
        };
      }),
    );

    const order = await prisma.outboundOrder.create({
      data: {
        orderNo,
        type: data.type,
        warehouseId: data.warehouseId,
        customerId: data.customerId,
        status: ORDER_STATUS.DRAFT,
        totalAmount: new Prisma.Decimal(totalAmount),
        totalQty: new Prisma.Decimal(totalQty),
        remark: data.remark,
        operatorId: data.operatorId,
        outboundItems: {
          create: itemsData,
        },
      },
      include: { outboundItems: true },
    });

    return order;
  }

  /**
   * 提交审批（锁定库存）
   */
  static async submitForApproval(id: number, operatorId?: number) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.outboundOrder.findUnique({
        where: { id },
        include: { outboundItems: true },
      });

      if (!order) throw new NotFoundError('出库单', id);
      if (order.status !== ORDER_STATUS.DRAFT) {
        throw new InvalidStateError(order.status, '提交审批');
      }

      // 校验并锁定库存
      for (const item of order.outboundItems) {
        const qty = Number(item.quantity);
        const inv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });

        if (!inv) {
          throw new InsufficientStockError(
            `商品(${item.productId})`,
            qty,
            0,
          );
        }

        const available = Number(inv.onHand) - Number(inv.locked);
        if (available < qty) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          throw new InsufficientStockError(
            product?.name || `商品(${item.productId})`,
            qty,
            available,
          );
        }

        // 使用乐观锁锁定库存
        const result = await tx.inventory.updateMany({
          where: {
            id: inv.id,
            version: inv.version, // 乐观锁条件
          },
          data: {
            locked: { increment: qty },
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          throw new ConflictError('库存数据已被其他人修改，请刷新后重试');
        }
      }

      // 创建审批流
      await tx.approvalFlow.create({
        data: {
          refType: 'OUTBOUND',
          refId: order.id,
          refNo: order.orderNo,
          status: 'PENDING',
          applicantId: operatorId || 0,
        },
      });

      // 更新状态
      await tx.outboundOrder.update({
        where: { id },
        data: { status: ORDER_STATUS.LOCKED, lockedAt: new Date() },
      });

      return { orderNo: order.orderNo, status: ORDER_STATUS.LOCKED };
    });
  }

  /**
   * 审批通过后过账（扣减库存）
   */
  static async post(id: number, operatorId?: number, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.outboundOrder.findUnique({
        where: { id },
        include: { outboundItems: true },
      });

      if (!order) throw new NotFoundError('出库单', id);
      if (order.status !== ORDER_STATUS.LOCKED && order.status !== ORDER_STATUS.APPROVED) {
        throw new InvalidStateError(order.status, '过账');
      }

      const now = new Date();

      for (const item of order.outboundItems) {
        const qty = Number(item.quantity);

        // 查询当前库存（带乐观锁）
        const inv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });

        if (!inv) throw new Error(`商品(${item.productId})库存记录不存在`);

        const beforeQty = Number(inv.onHand);

        // 扣减库存，释放锁定
        const result = await tx.inventory.updateMany({
          where: {
            id: inv.id,
            version: inv.version,
          },
          data: {
            onHand: { decrement: qty },
            locked: { decrement: qty },
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          throw new ConflictError('库存数据已被修改，请刷新后重试');
        }

        // 扣减批次库存（FIFO：先入先出）
        const lots = await tx.inventoryLot.findMany({
          where: {
            productId: item.productId,
            warehouseId: order.warehouseId,
            status: 1,
            quantity: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' }, // FIFO
        });

        let remaining = qty;
        let fifoTotalCost = 0;
        let fifoConsumedQty = 0;
        for (const lot of lots) {
          if (remaining <= 0) break;
          const lotQty = Number(lot.quantity);
          const lotCost = lot.costPrice ? Number(lot.costPrice) : 0;
          const deduct = Math.min(remaining, lotQty);

          await tx.inventoryLot.update({
            where: { id: lot.id },
            data: { quantity: { decrement: deduct } },
          });

          // 累加FIFO成本
          fifoTotalCost += lotCost * deduct;
          fifoConsumedQty += deduct;

          // 写批次拣货记录
          await tx.outboundLotPick.create({
            data: {
              outboundItemId: item.id,
              lotNumber: lot.lotNumber,
              quantity: deduct,
            },
          });

          remaining -= deduct;
        }

        // 计算FIFO加权平均成本
        const fifoCostPrice = fifoConsumedQty > 0 ? fifoTotalCost / fifoConsumedQty : Number(item.costPrice || 0);

        // 写库存流水（使用FIFO实际成本）
        await tx.inventoryTransaction.create({
          data: {
            txnType: 'OUTBOUND',
            refType: 'OUTBOUND',
            refId: order.id,
            refNo: order.orderNo,
            productId: item.productId,
            warehouseId: order.warehouseId,
            skuVariantId: item.skuVariantId,
            quantity: -qty, // 负数表示出库
            costPrice: fifoCostPrice > 0 ? new Prisma.Decimal(fifoCostPrice) : item.costPrice,
            beforeQty,
            afterQty: beforeQty - qty,
            operatorId,
            txnTime: now,
          },
        });
      }

      // 更新出库单状态
      await tx.outboundOrder.update({
        where: { id },
        data: {
          status: ORDER_STATUS.POSTED,
          postedAt: now,
        },
      });

      // 审计日志
      await tx.operationLog.create({
        data: {
          userId: operatorId,
          module: 'OUTBOUND',
          action: 'POST',
          refType: 'OUTBOUND',
          refId: order.id,
          content: `出库单 ${order.orderNo} 已过账`,
          ip: ip || null,
        },
      });

      return { orderNo: order.orderNo, status: ORDER_STATUS.POSTED };
    });
  }

  /**
   * 审批
   */
  static async approve(
    id: number,
    approved: boolean,
    approverId: number,
    remark?: string,
  ) {
    const order = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('出库单', id);

    if (order.status !== ORDER_STATUS.LOCKED) {
      throw new InvalidStateError(order.status, '审批');
    }

    if (approved) {
      // 审批通过 → 更新状态，等待过账
      await prisma.$transaction([
        prisma.outboundOrder.update({
          where: { id },
          data: { status: ORDER_STATUS.APPROVED },
        }),
        prisma.approvalFlow.updateMany({
          where: { refType: 'OUTBOUND', refId: id, status: 'PENDING' },
          data: {
            status: 'APPROVED',
            approverId,
            approvedAt: new Date(),
            remark,
          },
        }),
      ]);
      return { orderNo: order.orderNo, status: ORDER_STATUS.APPROVED };
    } else {
      // 审批拒绝 → 解锁库存
      await prisma.$transaction(async (tx) => {
        const items = await tx.outboundItem.findMany({ where: { orderId: id } });

        for (const item of items) {
          await tx.inventory.update({
            where: {
              productId_warehouseId_skuVariantId: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                skuVariantId: item.skuVariantId || 0,
              },
            },
            data: {
              locked: { decrement: Number(item.quantity) },
              version: { increment: 1 },
            },
          });
        }

        await tx.outboundOrder.update({
          where: { id },
          data: { status: ORDER_STATUS.DRAFT },
        });

        await tx.approvalFlow.updateMany({
          where: { refType: 'OUTBOUND', refId: id, status: 'PENDING' },
          data: {
            status: 'REJECTED',
            approverId,
            approvedAt: new Date(),
            remark,
          },
        });
      });

      return { orderNo: order.orderNo, status: ORDER_STATUS.DRAFT };
    }
  }
}
