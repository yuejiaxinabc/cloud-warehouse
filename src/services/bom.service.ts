import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { Prisma } from '@prisma/client';

/**
 * BOM 服务
 * BOM 管理、齐套校验、标准成本计算
 */
export class BomService {
  /**
   * BOM 列表
   */
  static async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    productId?: number;
  }) {
    const { page, pageSize, keyword, productId } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.BomWhereInput = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }
    if (productId) where.productId = productId;

    const [list, total] = await Promise.all([
      prisma.bom.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, code: true } },
          bomItems: {
            include: {
              product: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.bom.count({ where }),
    ]);

    return {
      list: list.map((b) => ({
        ...b,
        id: Number(b.id),
        productId: Number(b.productId),
        items: b.bomItems.map((item) => ({
          ...item,
          id: Number(item.id),
          productId: Number(item.productId),
          quantity: Number(item.quantity),
          wastage: item.wastage ? Number(item.wastage) : 0,
        })),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取 BOM 详情
   */
  static async getById(id: number) {
    const bom = await prisma.bom.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, code: true } },
        bomItems: {
          include: {
            product: { select: { id: true, name: true, code: true, defaultCost: true, unit: true } },
          },
        },
      },
    });

    if (!bom) throw new NotFoundError('BOM', id);
    return bom;
  }

  /**
   * 创建 BOM
   */
  static async create(data: {
    name: string;
    code: string;
    productId: number;
    version?: string;
    remark?: string;
    items: {
      productId: number;
      quantity: number;
      wastage?: number;
      remark?: string;
    }[];
  }) {
    // 校验成品是否存在
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) throw new NotFoundError('成品商品', data.productId);

    // 校验编码唯一性
    const existing = await prisma.bom.findUnique({ where: { code: data.code } });
    if (existing) throw new Error(`BOM编码"${data.code}"已存在`);

    // 校验物料是否存在
    for (const item of data.items) {
      const material = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!material) throw new NotFoundError('物料商品', item.productId);
    }

    const bom = await prisma.bom.create({
      data: {
        name: data.name,
        code: data.code,
        productId: data.productId,
        version: data.version || '1.0',
        remark: data.remark,
        bomItems: {
          create: data.items.map((item) => ({
            productId: item.productId,
            quantity: new Prisma.Decimal(item.quantity),
            wastage: item.wastage ? new Prisma.Decimal(item.wastage) : new Prisma.Decimal(0),
            remark: item.remark,
          })),
        },
      },
      include: {
        bomItems: true,
      },
    });

    return bom;
  }

  /**
   * 更新 BOM
   */
  static async update(id: number, data: Partial<{
    name: string;
    version: string;
    status: number;
    remark: string;
    items: {
      productId: number;
      quantity: number;
      wastage?: number;
      remark?: string;
    }[];
  }>) {
    const bom = await prisma.bom.findUnique({ where: { id } });
    if (!bom) throw new NotFoundError('BOM', id);

    if (data.items) {
      // 删除旧物料，重新创建
      await prisma.bomItem.deleteMany({ where: { bomId: id } });
      await prisma.bomItem.createMany({
        data: data.items.map((item) => ({
          bomId: id,
          productId: item.productId,
          quantity: new Prisma.Decimal(item.quantity),
          wastage: item.wastage ? new Prisma.Decimal(item.wastage) : new Prisma.Decimal(0),
          remark: item.remark,
        })),
      });
    }

    return prisma.bom.update({
      where: { id },
      data: {
        name: data.name,
        version: data.version,
        status: data.status,
        remark: data.remark,
      },
    });
  }

  /**
   * 齐套校验
   * 检查生产指定数量的成品，物料是否充足
   */
  static async kitCheck(bomId: number, quantity: number) {
    const bom = await prisma.bom.findUnique({
      where: { id: bomId },
      include: {
        product: { select: { id: true, name: true } },
        bomItems: {
          include: {
            product: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!bom) throw new NotFoundError('BOM', bomId);

    const results = [];
    let isComplete = true;

    for (const item of bom.bomItems) {
      // 考虑损耗率的实际用量
      const wastageRate = item.wastage ? Number(item.wastage) / 100 : 0;
      const required = Number(item.quantity) * quantity * (1 + wastageRate);

      // 查询总可用库存
      const inventories = await prisma.inventory.findMany({
        where: { productId: item.productId },
      });

      const totalAvailable = inventories.reduce((sum, inv) => {
        return sum + Number(inv.onHand) - Number(inv.locked);
      }, 0);

      const shortage = Math.max(0, required - totalAvailable);

      if (shortage > 0) isComplete = false;

      results.push({
        productId: Number(item.productId),
        productName: item.product.name,
        productCode: item.product.code,
        unitQty: Number(item.quantity),
        wastageRate: wastageRate * 100,
        required: Math.ceil(required * 1000) / 1000,
        available: totalAvailable,
        shortage: Math.ceil(shortage * 1000) / 1000,
        isEnough: shortage <= 0,
      });
    }

    return {
      bomId: Number(bom.id),
      bomName: bom.name,
      productName: bom.product.name,
      quantity,
      isComplete,
      items: results,
    };
  }

  /**
   * 计算 BOM 标准成本
   * 标准成本 = Σ(物料用量 × 物料成本)
   */
  static async calcStandardCost(bomId: number) {
    const bom = await prisma.bom.findUnique({
      where: { id: bomId },
      include: {
        product: { select: { id: true, name: true } },
        bomItems: {
          include: {
            product: { select: { id: true, name: true, defaultCost: true } },
          },
        },
      },
    });

    if (!bom) throw new NotFoundError('BOM', bomId);

    let totalCost = 0;
    const itemCosts = [];

    for (const item of bom.bomItems) {
      const unitCost = item.product.defaultCost ? Number(item.product.defaultCost) : 0;
      const qty = Number(item.quantity);
      const wastageRate = item.wastage ? Number(item.wastage) / 100 : 0;
      const actualQty = qty * (1 + wastageRate);
      const cost = actualQty * unitCost;

      totalCost += cost;
      itemCosts.push({
        productId: Number(item.productId),
        productName: item.product.name,
        unitQty: qty,
        wastageRate: wastageRate * 100,
        actualQty: Math.ceil(actualQty * 1000) / 1000,
        unitCost,
        cost: Math.round(cost * 10000) / 10000,
      });
    }

    return {
      bomId: Number(bom.id),
      bomName: bom.name,
      productName: bom.product.name,
      standardCost: Math.round(totalCost * 10000) / 10000,
      items: itemCosts,
    };
  }

  /**
   * 删除 BOM
   */
  static async delete(id: number) {
    const bom = await prisma.bom.findUnique({ where: { id } });
    if (!bom) throw new NotFoundError('BOM', id);

    await prisma.bomItem.deleteMany({ where: { bomId: id } });
    await prisma.bom.delete({ where: { id } });

    return { success: true };
  }
}
