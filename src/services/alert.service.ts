import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { Prisma } from '@prisma/client';

/**
 * 预警服务
 * 预警规则引擎、扫描推送
 */
export class AlertService {
  /**
   * 查询预警规则列表
   */
  static async listRules(params: {
    page: number;
    pageSize: number;
    type?: string;
    status?: number;
  }) {
    const { page, pageSize, type, status } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AlertRuleWhereInput = {};
    if (type) where.type = type;
    if (status !== undefined) where.status = status;

    const [list, total] = await Promise.all([
      prisma.alertRule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.alertRule.count({ where }),
    ]);

    return {
      list: list.map((r) => ({
        ...r,
        id: Number(r.id),
        targetId: r.targetId ? Number(r.targetId) : null,
        condition: r.condition as any,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 创建预警规则
   */
  static async createRule(data: {
    name: string;
    type: string;
    targetType: string;
    targetId?: number;
    condition: { threshold: number; operator: string };
    notifyType?: string;
  }) {
    return prisma.alertRule.create({
      data: {
        ...data,
        condition: data.condition as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * 更新预警规则
   */
  static async updateRule(id: number, data: Partial<{
    name: string;
    type: string;
    targetType: string;
    targetId: number;
    condition: { threshold: number; operator: string };
    notifyType: string;
    status: number;
  }>) {
    const rule = await prisma.alertRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundError('预警规则', id);

    return prisma.alertRule.update({
      where: { id },
      data: {
        ...data,
        condition: data.condition ? data.condition as Prisma.InputJsonValue : undefined,
      },
    });
  }

  /**
   * 删除预警规则
   */
  static async deleteRule(id: number) {
    const rule = await prisma.alertRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundError('预警规则', id);

    return prisma.alertRule.delete({ where: { id } });
  }

  /**
   * 查询预警列表
   */
  static async listAlerts(params: {
    page: number;
    pageSize: number;
    status?: string;
    level?: string;
    ruleId?: number;
  }) {
    const { page, pageSize, status, level, ruleId } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AlertWhereInput = {};
    if (status) where.status = status;
    if (level) where.level = level;
    if (ruleId) where.ruleId = ruleId;

    const [list, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          rule: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.alert.count({ where }),
    ]);

    return {
      list: list.map((a) => ({
        ...a,
        id: Number(a.id),
        ruleId: Number(a.ruleId),
        productId: a.productId ? Number(a.productId) : null,
        warehouseId: a.warehouseId ? Number(a.warehouseId) : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 标记预警为已读
   */
  static async markRead(id: number) {
    return prisma.alert.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  /**
   * 解决预警
   */
  static async resolve(id: number) {
    return prisma.alert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
  }

  /**
   * 扫描预警（核心引擎）
   * 遍历所有启用的规则，检查条件，生成预警
   */
  static async scan(): Promise<{ triggered: number }> {
    const rules = await prisma.alertRule.findMany({
      where: { status: 1 },
    });

    let triggered = 0;

    for (const rule of rules) {
      const condition = rule.condition as any;
      const { threshold, operator } = condition;

      switch (rule.type) {
        case 'LOW_STOCK':
          triggered += await this.checkLowStock(rule.id, rule.targetType, rule.targetId, threshold, operator);
          break;
        case 'OVERSTOCK':
          triggered += await this.checkOverstock(rule.id, rule.targetType, rule.targetId, threshold, operator);
          break;
        case 'EXPIRY':
          triggered += await this.checkExpiry(rule.id, rule.targetType, rule.targetId, threshold);
          break;
        case 'REORDER':
          triggered += await this.checkReorder(rule.id, rule.targetType, rule.targetId, threshold);
          break;
      }
    }

    return { triggered };
  }

  /**
   * 低库存检查
   */
  private static async checkLowStock(
    ruleId: number,
    targetType: string,
    targetId: number | null,
    threshold: number,
    operator: string,
  ): Promise<number> {
    const where: Prisma.InventoryWhereInput = {};

    if (targetType === 'PRODUCT' && targetId) {
      where.productId = targetId;
    } else if (targetType === 'WAREHOUSE' && targetId) {
      where.warehouseId = targetId;
    }

    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, code: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    let count = 0;
    for (const inv of inventories) {
      const onHand = Number(inv.onHand);
      let shouldAlert = false;

      switch (operator) {
        case 'lt': shouldAlert = onHand < threshold; break;
        case 'lte': shouldAlert = onHand <= threshold; break;
        case 'eq': shouldAlert = onHand === threshold; break;
      }

      if (shouldAlert) {
        // 检查是否已有未解决的同类预警
        const existing = await prisma.alert.findFirst({
          where: {
            ruleId,
            productId: inv.productId,
            warehouseId: inv.warehouseId,
            status: { in: ['UNREAD', 'READ'] },
          },
        });

        if (!existing) {
          await prisma.alert.create({
            data: {
              ruleId,
              productId: inv.productId,
              warehouseId: inv.warehouseId,
              level: onHand === 0 ? 'CRITICAL' : 'WARNING',
              title: `低库存预警：${inv.product.name}`,
              content: `商品"${inv.product.name}"在仓库"${inv.warehouse.name}"的库存为 ${onHand}，低于阈值 ${threshold}`,
            },
          });
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 高库存检查
   */
  private static async checkOverstock(
    ruleId: number,
    targetType: string,
    targetId: number | null,
    threshold: number,
    operator: string,
  ): Promise<number> {
    const where: Prisma.InventoryWhereInput = {};
    if (targetType === 'PRODUCT' && targetId) where.productId = targetId;
    if (targetType === 'WAREHOUSE' && targetId) where.warehouseId = targetId;

    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    let count = 0;
    for (const inv of inventories) {
      const onHand = Number(inv.onHand);
      let shouldAlert = false;

      switch (operator) {
        case 'gt': shouldAlert = onHand > threshold; break;
        case 'gte': shouldAlert = onHand >= threshold; break;
      }

      if (shouldAlert) {
        const existing = await prisma.alert.findFirst({
          where: {
            ruleId,
            productId: inv.productId,
            warehouseId: inv.warehouseId,
            status: { in: ['UNREAD', 'READ'] },
          },
        });

        if (!existing) {
          await prisma.alert.create({
            data: {
              ruleId,
              productId: inv.productId,
              warehouseId: inv.warehouseId,
              level: 'WARNING',
              title: `高库存预警：${inv.product.name}`,
              content: `商品"${inv.product.name}"在仓库"${inv.warehouse.name}"的库存为 ${onHand}，超过阈值 ${threshold}`,
            },
          });
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 过期检查
   */
  private static async checkExpiry(
    ruleId: number,
    targetType: string,
    targetId: number | null,
    thresholdDays: number,
  ): Promise<number> {
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + thresholdDays);

    const where: Prisma.InventoryLotWhereInput = {
      expiredAt: { lte: expireDate },
      status: 1,
      quantity: { gt: 0 },
    };

    if (targetType === 'PRODUCT' && targetId) where.productId = targetId;

    const lots = await prisma.inventoryLot.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    let count = 0;
    for (const lot of lots) {
      const existing = await prisma.alert.findFirst({
        where: {
          ruleId,
          productId: lot.productId,
          warehouseId: lot.warehouseId,
          status: { in: ['UNREAD', 'READ'] },
        },
      });

      if (!existing) {
        const daysLeft = lot.expiredAt
          ? Math.ceil((lot.expiredAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        await prisma.alert.create({
          data: {
            ruleId,
            productId: lot.productId,
            warehouseId: lot.warehouseId,
            level: daysLeft <= 0 ? 'CRITICAL' : 'WARNING',
            title: `过期预警：${lot.product.name}（批次${lot.lotNumber}）`,
            content: `批次"${lot.lotNumber}"将在${daysLeft}天后过期，剩余数量：${lot.quantity}`,
          },
        });
        count++;
      }
    }

    return count;
  }

  /**
   * 补货检查
   */
  private static async checkReorder(
    ruleId: number,
    targetType: string,
    targetId: number | null,
    threshold: number,
  ): Promise<number> {
    const where: Prisma.ProductWhereInput = { status: 1 };
    if (targetType === 'PRODUCT' && targetId) where.id = targetId;

    const products = await prisma.product.findMany({
      where,
      include: {
        inventories: true,
      },
    });

    let count = 0;
    for (const product of products) {
      const totalOnHand = product.inventories.reduce(
        (sum, inv) => sum + Number(inv.onHand),
        0,
      );

      if (totalOnHand < threshold) {
        const existing = await prisma.alert.findFirst({
          where: {
            ruleId,
            productId: product.id,
            status: { in: ['UNREAD', 'READ'] },
          },
        });

        if (!existing) {
          await prisma.alert.create({
            data: {
              ruleId,
              productId: product.id,
              level: 'INFO',
              title: `补货提醒：${product.name}`,
              content: `商品"${product.name}"总库存 ${totalOnHand}，建议补货。交期：${product.leadTimeDays || '未设置'}天`,
            },
          });
          count++;
        }
      }
    }

    return count;
  }
}
