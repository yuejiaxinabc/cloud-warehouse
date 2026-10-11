import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { Prisma } from '@prisma/client';

/**
 * 商品服务
 * 处理商品 CRUD、SKU 生成等
 */
export class ProductService {
  /**
   * 商品列表查询（支持搜索、筛选、分页）
   */
  static async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    categoryId?: number;
    status?: number;
    costMethod?: string;
  }) {
    const { page, pageSize, keyword, categoryId, status, costMethod } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ProductWhereInput = {};

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { barcode: { contains: keyword } },
        { brand: { contains: keyword } },
      ];
    }

    if (categoryId) where.categoryId = categoryId;
    if (status !== undefined) where.status = status;
    if (costMethod) where.costMethod = costMethod;

    const [list, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      list: list.map((p) => ({
        ...p,
        id: Number(p.id),
        categoryId: p.categoryId ? Number(p.categoryId) : null,
        unitId: p.unitId ? Number(p.unitId) : null,
        safetyStock: p.safetyStock ? Number(p.safetyStock) : null,
        maxStock: p.maxStock ? Number(p.maxStock) : null,
        defaultCost: p.defaultCost ? Number(p.defaultCost) : null,
        salePrice: p.salePrice ? Number(p.salePrice) : null,
        weight: p.weight ? Number(p.weight) : null,
        volume: p.volume ? Number(p.volume) : null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取商品详情
   */
  static async getById(id: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        unit: true,
        productSuppliers: {
          include: { supplier: { select: { id: true, name: true, code: true } } },
        },
        skuVariants: true,
        costSettings: true,
      },
    });

    if (!product) throw new NotFoundError('商品', id);
    return product;
  }

  /**
   * 创建商品
   */
  static async create(data: {
    name: string;
    code: string;
    barcode?: string;
    categoryId?: number;
    unitId?: number;
    spec?: string;
    specJson?: Record<string, any>;
    brand?: string;
    model?: string;
    weight?: number;
    volume?: number;
    safetyStock?: number;
    maxStock?: number;
    leadTimeDays?: number;
    shelfLifeDays?: number;
    defaultCost?: number;
    salePrice?: number;
    costMethod?: string;
    enableSerial?: boolean;
    enableBatch?: boolean;
    remark?: string;
  }) {
    // 检查编码唯一性
    const existing = await prisma.product.findFirst({
      where: { OR: [{ code: data.code }, ...(data.barcode ? [{ barcode: data.barcode }] : [])] },
    });
    if (existing) {
      throw new Error(`商品编码"${data.code}"或条码已存在`);
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        specJson: data.specJson ? data.specJson as Prisma.InputJsonValue : undefined,
        safetyStock: data.safetyStock,
        maxStock: data.maxStock,
        defaultCost: data.defaultCost,
        salePrice: data.salePrice,
        weight: data.weight,
        volume: data.volume,
      },
    });

    return product;
  }

  /**
   * 更新商品
   */
  static async update(id: number, data: Partial<{
    name: string;
    barcode: string;
    categoryId: number;
    unitId: number;
    spec: string;
    specJson: Record<string, any>;
    brand: string;
    model: string;
    weight: number;
    volume: number;
    safetyStock: number;
    maxStock: number;
    leadTimeDays: number;
    shelfLifeDays: number;
    defaultCost: number;
    salePrice: number;
    costMethod: string;
    enableSerial: boolean;
    enableBatch: boolean;
    status: number;
    remark: string;
  }>) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError('商品', id);

    return prisma.product.update({
      where: { id },
      data: {
        ...data,
        specJson: data.specJson ? data.specJson as Prisma.InputJsonValue : undefined,
      },
    });
  }

  /**
   * 删除商品（软删除：禁用）
   */
  static async delete(id: number) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError('商品', id);

    // 检查是否有库存
    const inventory = await prisma.inventory.findFirst({
      where: { productId: id, onHand: { gt: 0 } },
    });
    if (inventory) {
      throw new Error('该商品仍有库存，无法删除');
    }

    return prisma.product.update({
      where: { id },
      data: { status: 0 },
    });
  }

  /**
   * 生成 SKU 编码
   * 格式：商品编码-属性值缩写，如 HW-M60P-BLK-128
   */
  static generateSku(productCode: string, attributes: Record<string, string>): string {
    const attrPart = Object.values(attributes)
      .map((v) => v.substring(0, 4).toUpperCase())
      .join('-');
    return attrPart ? `${productCode}-${attrPart}` : productCode;
  }
}
