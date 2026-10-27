import { prisma } from '@/lib/prisma';
import { generateOrderNo } from '@/lib/utils';
import { NotFoundError, InvalidStateError, AppError } from '@/lib/errors';
import { ORDER_STATUS } from '@/lib/constants';
import { Prisma } from '@prisma/client';
import { syncLocationStock, assertLocationInWarehouse } from '@/lib/location-binding';
import { assertLocationAvailableFor } from '@/lib/location-occupancy';

/**
 * 入库服务
 * 处理入库单的创建、过账等操作
 */
export class StockInService {
  /**
   * 入库单列表
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

    const where: Prisma.InboundOrderWhereInput = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword } },
        { supplier: { name: { contains: keyword } } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [list, total] = await Promise.all([
      prisma.inboundOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          inboundItems: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.inboundOrder.count({ where }),
    ]);

    return {
      list: list.map((o) => ({
        ...o,
        id: Number(o.id),
        supplierId: o.supplierId ? Number(o.supplierId) : null,
        totalAmount: o.totalAmount ? Number(o.totalAmount) : null,
        totalQty: o.totalQty ? Number(o.totalQty) : null,
        items: o.inboundItems.map((item) => ({
          ...item,
          id: Number(item.id),
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          receivedQty: item.receivedQty ? Number(item.receivedQty) : null,
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
   * 获取入库单详情
   */
  static async getById(id: number) {
    const order = await prisma.inboundOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        inboundItems: {
          include: {
            product: { select: { id: true, name: true, code: true } },
            lotAllocations: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundError('入库单', id);
    return order;
  }

  /**
   * 创建入库单
   */
  static async create(data: {
    type: string;
    warehouseId: number;
    supplierId?: number;
    remark?: string;
    items: {
      productId: number;
      skuVariantId?: number;
      lotNumber?: string;
      quantity: number;
      costPrice?: number;
      remark?: string;
    }[];
    operatorId?: number;
  }) {
    const orderNo = await generateOrderNo('IN', prisma);

    // 计算总金额和总数量
    let totalAmount = 0;
    let totalQty = 0;
    const itemsData = data.items.map((item) => {
      const amount = item.costPrice ? item.quantity * item.costPrice : 0;
      totalAmount += amount;
      totalQty += item.quantity;
      return {
        productId: item.productId,
        skuVariantId: item.skuVariantId,
        lotNumber: item.lotNumber,
        quantity: new Prisma.Decimal(item.quantity),
        costPrice: item.costPrice ? new Prisma.Decimal(item.costPrice) : null,
        amount: amount > 0 ? new Prisma.Decimal(amount) : null,
        remark: item.remark,
      };
    });

    const order = await prisma.inboundOrder.create({
      data: {
        orderNo,
        type: data.type,
        warehouseId: data.warehouseId,
        supplierId: data.supplierId,
        status: ORDER_STATUS.DRAFT,
        totalAmount: new Prisma.Decimal(totalAmount),
        totalQty: new Prisma.Decimal(totalQty),
        remark: data.remark,
        operatorId: data.operatorId,
        inboundItems: {
          create: itemsData,
        },
      },
      include: {
        inboundItems: true,
      },
    });

    return order;
  }

  /**
   * 入库过账（核心操作）
   * 事务：写流水 + 更新库存 + 更新批次 + 审计日志
   */
  static async post(id: number, operatorId?: number, ip?: string) {
    return prisma.$transaction(async (tx) => {
      // 1. 查询并锁定入库单
      const order = await tx.inboundOrder.findUnique({
        where: { id },
        include: {
          inboundItems: {
            include: { lotAllocations: true },
          },
        },
      });

      if (!order) throw new NotFoundError('入库单', id);
      if (order.status !== ORDER_STATUS.DRAFT) {
        throw new InvalidStateError(order.status, '过账');
      }

      const now = new Date();

      // 2. 逐项处理入库
      for (const item of order.inboundItems) {
        const qty = Number(item.quantity);
        const costPrice = item.costPrice ? Number(item.costPrice) : 0;

        // 批次号：优先用批次分配 > 单据批号 > 自动生成
        let lotNumber = item.lotNumber || null;
        if (item.lotAllocations.length > 0) {
          lotNumber = item.lotAllocations[0].lotNumber;
        }
        if (!lotNumber) {
          // 自动生成批次号：LOT-YYYYMMDD-XXX（按当日计数，全局唯一）
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const lotCount = await tx.inventoryLot.count({
            where: { lotNumber: { startsWith: `LOT-${today}` } },
          });
          lotNumber = `LOT-${today}-${String(lotCount + 1).padStart(3, '0')}`;
        }

        // 2a. 更新/创建库存余额
        // FIX-2026-1013：旧数据的 sku_variant_id 是 NULL，新逻辑传 0，
        // findUnique 匹配不上就会给同一商品再插一行库存 ——
        // 结果货架上同一个商品出现两次。这里用 OR 兼容两种取值。
        const existingInv = await tx.inventory.findFirst({
          where: {
            productId: item.productId,
            warehouseId: order.warehouseId,
            OR: [
              { skuVariantId: item.skuVariantId || 0 },
              { skuVariantId: null },
            ],
          },
          orderBy: { id: 'asc' },
        });

        // FIX-2026-1013：入库必须落到货位。原来只写 inventory，
        // 不写 locationId 也不写 location_stocks，直接导致货架地图空白。
        const rawLocationId = (item as any).locationId;
        if (!rawLocationId) {
          throw new AppError('入库明细缺少货位：商品必须绑定四段货位（区-排-列-位），请选择货位后重新提交', 400);
        }
        const boundLocationId = BigInt(rawLocationId);
        await assertLocationInWarehouse(tx, boundLocationId, order.warehouseId);
        // 一个货位只能放同一种商品，换品种必须换货位
        await assertLocationAvailableFor(tx, { locationId: boundLocationId, productId: item.productId });

        let invId: bigint;
        if (existingInv) {
          // 移动加权平均法计算新成本
          const oldQty = Number(existingInv.onHand);
          const oldCost = existingInv.avgCost ? Number(existingInv.avgCost) : 0;
          const newAvgCost = costPrice > 0 && (oldQty + qty) > 0
            ? (oldQty * oldCost + qty * costPrice) / (oldQty + qty)
            : oldCost;

          await tx.inventory.update({
            where: { id: existingInv.id },
            data: {
              onHand: { increment: qty },
              avgCost: new Prisma.Decimal(newAvgCost),
              version: { increment: 1 },
              locationId: boundLocationId,
            },
          });
          invId = existingInv.id;
        } else {
          const created = await tx.inventory.create({
            data: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              skuVariantId: item.skuVariantId || 0,
              locationId: boundLocationId,
              onHand: qty,
              locked: 0,
              avgCost: costPrice > 0 ? new Prisma.Decimal(costPrice) : null,
              version: 0,
            },
          });
          invId = created.id;
        }

        // 货位明细：货架地图的唯一数据源，必须同步写
        await syncLocationStock(tx, {
          inventoryId: invId,
          productId: item.productId,
          warehouseId: order.warehouseId,
          locationId: boundLocationId,
          quantity: qty,
          lotNumber: lotNumber || null,
        });

        // 2b. 批次库存处理
        if (item.lotAllocations.length > 0) {
          for (const alloc of item.lotAllocations) {
            const allocQty = Number(alloc.quantity);
            const existingLot = await tx.inventoryLot.findFirst({
              where: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                lotNumber: alloc.lotNumber,
              },
            });

            if (existingLot) {
              await tx.inventoryLot.update({
                where: { id: existingLot.id },
                data: { quantity: { increment: allocQty } },
              });
            } else {
              await tx.inventoryLot.create({
                data: {
                  productId: item.productId,
                  warehouseId: order.warehouseId,
                  lotNumber: alloc.lotNumber,
                  quantity: allocQty,
                  costPrice: alloc.costPrice || item.costPrice,
                  producedAt: alloc.producedAt,
                  expiredAt: alloc.expiredAt,
                },
              });
            }
          }
        } else {
          // 没有批次分配：用单据批号或自动生成的批次号，创建/累加批次
          const existingLot = await tx.inventoryLot.findFirst({
            where: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              lotNumber,
            },
          });

          if (existingLot) {
            await tx.inventoryLot.update({
              where: { id: existingLot.id },
              data: { quantity: { increment: qty } },
            });
          } else {
            await tx.inventoryLot.create({
              data: {
                productId: item.productId,
                warehouseId: order.warehouseId,
                lotNumber,
                quantity: qty,
                costPrice: item.costPrice,
              },
            });
          }
        }

        // 2c. 写库存流水
        const inv = await tx.inventory.findUnique({
          where: {
            productId_warehouseId_skuVariantId: {
              productId: item.productId,
              warehouseId: order.warehouseId,
              skuVariantId: item.skuVariantId || 0,
            },
          },
        });

        await tx.inventoryTransaction.create({
          data: {
            txnType: 'INBOUND',
            refType: 'INBOUND',
            refId: order.id,
            refNo: order.orderNo,
            productId: item.productId,
            warehouseId: order.warehouseId,
            skuVariantId: item.skuVariantId,
            lotNumber: lotNumber,
            quantity: qty,
            costPrice: item.costPrice,
            beforeQty: inv ? Number(inv.onHand) - qty : 0,
            afterQty: inv ? Number(inv.onHand) : qty,
            operatorId,
            txnTime: now,
          },
        });

        // 2d. 自动生成序列号（入库单号 = 序列号，过账单号 = 批次号）
        const serialNo = order.orderNo + '-' + (item.id || '');
        const batchNo = order.orderNo;
        await tx.serialNumber.create({
          data: {
            serialNo: serialNo,
            productId: item.productId,
            warehouseId: order.warehouseId,
            lotNumber: batchNo,
            status: 'in_stock',
            remark: '入库自动生成',
          },
        }).catch(() => {
          // 忽略重复序列号错误
        });
      }

      // 3. 更新入库单状态
      await tx.inboundOrder.update({
        where: { id },
        data: {
          status: ORDER_STATUS.POSTED,
          postedAt: now,
        },
      });

      // 4. 审计日志
      await tx.operationLog.create({
        data: {
          userId: operatorId,
          module: 'INBOUND',
          action: 'POST',
          refType: 'INBOUND',
          refId: order.id,
          content: `入库单 ${order.orderNo} 已过账`,
          ip: ip || null,
        },
      });

      return { orderNo: order.orderNo, status: ORDER_STATUS.POSTED };
    });
  }
}