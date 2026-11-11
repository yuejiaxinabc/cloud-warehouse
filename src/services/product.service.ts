import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/lib/errors';
import { Prisma } from '@prisma/client';
// F8/F9：更新路径同样要过字段白名单与边界校验
import {
  requireProductName, optionalText, optionalMoney, optionalQty, optionalInt, optionalStatus,
  PRODUCT_LIMITS,
} from '@/lib/product-guard';

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

    // v1.2.4 B：service 入口同样过 guard（去标签、金额数量 >=0 且 <=1,000,000），
    // 防止其他调用方绕过路由层校验直写库。
    const clean: typeof data = {
      ...data,
      name: requireProductName(data.name),
      spec: optionalText(data.spec, '规格说明', PRODUCT_LIMITS.spec) ?? undefined,
      brand: optionalText(data.brand, '品牌', PRODUCT_LIMITS.brand) ?? undefined,
      model: optionalText(data.model, '型号', PRODUCT_LIMITS.model) ?? undefined,
      remark: optionalText(data.remark, '备注', PRODUCT_LIMITS.remark) ?? undefined,
      salePrice: optionalMoney(data.salePrice, '销售价') ?? undefined,
      defaultCost: optionalMoney(data.defaultCost, '默认成本') ?? undefined,
      safetyStock: optionalQty(data.safetyStock, '安全库存') ?? undefined,
      maxStock: optionalQty(data.maxStock, '库存上限') ?? undefined,
      weight: optionalMoney(data.weight, '重量', 1_000_000) ?? undefined,
      volume: optionalMoney(data.volume, '体积', 1_000_000) ?? undefined,
      shelfLifeDays: optionalInt(data.shelfLifeDays, '保质期天数', 0, 3650) ?? undefined,
      leadTimeDays: optionalInt(data.leadTimeDays, '采购周期', 0, 3650) ?? undefined,
    };

    const product = await prisma.product.create({
      data: {
        ...clean,
        specJson: data.specJson ? data.specJson as Prisma.InputJsonValue : undefined,
        safetyStock: clean.safetyStock,
        maxStock: clean.maxStock,
        defaultCost: clean.defaultCost,
        salePrice: clean.salePrice,
        weight: clean.weight,
        volume: clean.volume,
      },
    });

    return product;
  }

  /**
   * 更新商品
   */
  static async update(id: number, input: Record<string, any>) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundError('商品', id);

    // F8/F9：白名单 + 边界校验。
    // v1.2.0 直接 spread 入参，未知字段会让 Prisma 抛 unknown field（前端只看到 500），
    // 负数价格与 1e15 也能一路写进 Decimal 列。
    const data: Prisma.ProductUpdateInput = {};

    if (input.name !== undefined) data.name = requireProductName(input.name);
    if (input.barcode !== undefined) data.barcode = optionalText(input.barcode, '条码', PRODUCT_LIMITS.barcode);
    if (input.spec !== undefined) data.spec = optionalText(input.spec, '规格说明', PRODUCT_LIMITS.spec);
    if (input.brand !== undefined) data.brand = optionalText(input.brand, '品牌', PRODUCT_LIMITS.brand);
    if (input.model !== undefined) data.model = optionalText(input.model, '型号', PRODUCT_LIMITS.model);
    if (input.remark !== undefined) data.remark = optionalText(input.remark, '备注', PRODUCT_LIMITS.remark);
    if (input.imageUrl !== undefined) data.imageUrl = optionalText(input.imageUrl, '图片地址', PRODUCT_LIMITS.imageUrl);

    if (input.salePrice !== undefined) data.salePrice = optionalMoney(input.salePrice, '销售价');
    if (input.defaultCost !== undefined) data.defaultCost = optionalMoney(input.defaultCost, '默认成本');
    if (input.safetyStock !== undefined) data.safetyStock = optionalQty(input.safetyStock, '安全库存');
    if (input.maxStock !== undefined) data.maxStock = optionalQty(input.maxStock, '库存上限');
    if (input.shelfLifeDays !== undefined) data.shelfLifeDays = optionalInt(input.shelfLifeDays, '保质期天数', 0, 3650);
    if (input.leadTimeDays !== undefined) data.leadTimeDays = optionalInt(input.leadTimeDays, '采购周期', 0, 3650);
    if (input.weight !== undefined) data.weight = optionalMoney(input.weight, '重量', 1_000_000);
    if (input.volume !== undefined) data.volume = optionalMoney(input.volume, '体积', 1_000_000);
    if (input.status !== undefined) data.status = optionalStatus(input.status);

    if (input.costMethod !== undefined) {
      data.costMethod = ['WEIGHTED', 'FIFO', 'MONTHLY'].includes(String(input.costMethod))
        ? String(input.costMethod)
        : product.costMethod;
    }
    if (input.enableSerial !== undefined) data.enableSerial = !!input.enableSerial;
    if (input.enableBatch !== undefined) data.enableBatch = !!input.enableBatch;
    if (input.categoryId !== undefined) {
      data.category = input.categoryId ? { connect: { id: BigInt(input.categoryId) } } : { disconnect: true };
    }
    if (input.unitId !== undefined) {
      data.unit = input.unitId ? { connect: { id: BigInt(input.unitId) } } : { disconnect: true };
    }
    if (input.specJson !== undefined) {
      data.specJson = input.specJson ? (input.specJson as Prisma.InputJsonValue) : Prisma.JsonNull;
    }

    return prisma.product.update({ where: { id }, data });
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

    // P3-2：编码永久占用问题。
    // 原来的「删除」只是 status=0，code 仍占着唯一键，想用同一个编码重建商品永远失败。
    // 这里在停用的同时把编码腾出来：code 追加 __del_<id> 后缀，原编码即可复用。
    // 保留原名便于追溯（列表里能看到它曾是哪个编码），也避免删除历史单据对不上。
    const archivedCode = product.code.includes('__del_') ? product.code : product.code + '__del_' + id;
    return prisma.product.update({
      where: { id },
      data: { status: 0, deletedAt: new Date(), code: archivedCode },
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
