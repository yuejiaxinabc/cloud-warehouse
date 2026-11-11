import { authorizeDataOperation } from '@/lib/data-scope';
import { prisma } from '@/lib/prisma';
import { generateOrderNo } from '@/lib/utils';
import { AppError, NotFoundError, InvalidStateError, InsufficientStockError, ConflictError } from '@/lib/errors';
// v1.2.1：available 必须在同一事务内跟随 onHand/locked 重算（P1-2），统一走 lib/inventory-sync
import { recalcAvailable } from '@/lib/inventory-sync';
import { ORDER_STATUS } from '@/lib/constants';
// H1/H2 修复：数量防线 + 单据行排他锁
import { assertPositiveQty } from '@/lib/qty-guard';
import { lockOrderRow } from '@/lib/order-lock';
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
    await authorizeDataOperation(data.operatorId, 'stock_out:create', data, { create: true, transfer: false });
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
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) throw new NotFoundError('单据', id);
    await authorizeDataOperation(operatorId, 'stock_out:create', scopeOrder, { transfer: false });
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

        // v1.2.4 B：报错里展示的可用量不为负（比较逻辑不变）
        const available = Math.max(0, Number(inv.onHand) - Number(inv.locked));
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

        // v1.2.1：锁定后同步可用量，否则列表里的 available 还停在锁定前
        await recalcAvailable(tx, { id: inv.id });
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
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) throw new NotFoundError('单据', id);
    await authorizeDataOperation(operatorId, 'stock_out:post', scopeOrder, { transfer: false });
    return prisma.$transaction(async (tx) => {
      // H2 修复：先锁单据行，并发过账第二次会阻塞并最终被状态校验拒绝
      const locked = await lockOrderRow(tx, 'outbound_orders', id);
      if (!locked) throw new NotFoundError('出库单', id);

      const order = await tx.outboundOrder.findUnique({
        where: { id },
        include: { outboundItems: true },
      });

      if (!order) throw new NotFoundError('出库单', id);
      if (order.status !== ORDER_STATUS.LOCKED && order.status !== ORDER_STATUS.APPROVED) {
        throw new InvalidStateError(order.status, '过账');
      }

      const now = new Date();

      for (const [itemIndex, item] of order.outboundItems.entries()) {
        // H1 修复：负数量出库等于变相入库（实测 -3 过账后 onHand +3），过账前强制校验
        const qty = assertPositiveQty(item.quantity, '第 ' + (itemIndex + 1) + ' 行出库数量');

        // 查询当前库存（带乐观锁）
        // v1.2.1：历史库存的 sku_variant_id 可能为 NULL，用复合唯一键会查不到 → 改 findFirst
        const inv = await tx.inventory.findFirst({
          where: {
            productId: item.productId,
            warehouseId: order.warehouseId,
            OR: [{ skuVariantId: item.skuVariantId ?? null }, { skuVariantId: null }],
          },
          orderBy: { id: 'asc' },
        });

        if (!inv) throw new AppError(`商品(${item.productId})库存记录不存在`, 400);

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

        // v1.2.1：过账扣减后同步可用量
        await recalcAvailable(tx, { id: inv.id });

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

      // 更新出库单状态（H2 第二道闸：只有仍处于可过账状态时才允许落库）
      const claimed = await tx.outboundOrder.updateMany({
        where: { id, status: { in: [ORDER_STATUS.LOCKED, ORDER_STATUS.APPROVED] } },
        data: {
          status: ORDER_STATUS.POSTED,
          postedAt: now,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictError('该出库单已被过账或状态已变更，请刷新后查看');
      }

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
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) throw new NotFoundError('单据', id);
    await authorizeDataOperation(approverId, 'stock_out:approve', scopeOrder, { transfer: false });
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
        // v1.2.1：解锁不能依赖复合唯一键。历史库存的 sku_variant_id 可能是 NULL，
        // 用 productId_warehouseId_skuVariantId 更新会抛 P2025 并让整个事务回滚，
        // 结果就是「审批拒绝成功但 locked 没释放」。改成先定位再按主键更新。
        for (const item of items) {
          const inv = await tx.inventory.findFirst({
            where: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              OR: [{ skuVariantId: item.skuVariantId ?? null }, { skuVariantId: null }],
            },
            orderBy: { id: 'asc' },
          });
          if (!inv) continue;
          const nextLocked = Math.max(0, Number(inv.locked) - Number(item.quantity));
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              locked: nextLocked,
              // available 与 locked 必须同事务重算，否则列表里的可用量会一直是旧值
              available: Math.max(0, Number(inv.onHand) - nextLocked),
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

  /**
   * 取消出库单（v1.2.1 新增）
   *
   * 背景：v1.2.0 出库单一旦 submit 就进 LOCKED，approve 因 schema 必填 boolean 而 500、
   * post 只认 DRAFT、又没有取消入口，锁定库存成了永久占用。这里给出唯一合法的解锁出口。
   * 规则：
   *  - DRAFT：直接置 CANCELLED（没有锁定量）；
   *  - LOCKED / APPROVED：先释放 inventory.locked 再置 CANCELLED；
   *  - POSTED / CANCELLED：不允许取消（已出库需要走逆向单据）。
   */
  static async cancel(id: number, operatorId: number, reason?: string) {
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) throw new NotFoundError('单据', id);
    await authorizeDataOperation(operatorId, 'stock_out:approve', scopeOrder, { transfer: false });
    const order = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundError('出库单', id);

    if (order.status === ORDER_STATUS.CANCELLED) {
      return { orderNo: order.orderNo, status: ORDER_STATUS.CANCELLED };
    }
    if (order.status === ORDER_STATUS.POSTED) {
      throw new AppError('已过账的出库单不能取消，请走退货/逆向单据', 400);
    }

    await prisma.$transaction(async (tx) => {
      if (order.status === ORDER_STATUS.LOCKED || order.status === ORDER_STATUS.APPROVED) {
        const items = await tx.outboundItem.findMany({ where: { orderId: id } });
        for (const item of items) {
          const inv = await tx.inventory.findFirst({
            where: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              OR: [{ skuVariantId: item.skuVariantId ?? null }, { skuVariantId: null }],
            },
            orderBy: { id: 'asc' },
          });
          if (!inv) continue;
          const nextLocked = Math.max(0, Number(inv.locked) - Number(item.quantity));
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              locked: nextLocked,
              available: Math.max(0, Number(inv.onHand) - nextLocked),
              version: { increment: 1 },
            },
          });
        }
      }

      await tx.outboundOrder.update({
        where: { id },
        data: { status: ORDER_STATUS.CANCELLED, remark: reason ? `取消原因：${reason}`.slice(0, 500) : order.remark },
      });

      await tx.approvalFlow.updateMany({
        where: { refType: 'OUTBOUND', refId: id, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'CANCELLED', approverId: operatorId, approvedAt: new Date(), remark: reason || '取消出库单' },
      });
    });

    return { orderNo: order.orderNo, status: ORDER_STATUS.CANCELLED };
  }
}
