import { businessAccess, warehouseWhere, withWarehouseScope } from '@/app/api/warehouse/access';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp, getClientPlatform, PLATFORM_NAMES } from '@/lib/log';
import { requireAuth, getSessionChecked } from '@/lib/auth-guard';
import { AppError, handleApiError } from '@/lib/errors';
import { parsePagination } from '@/lib/pagination';
import { normalizeLocationCode, syncLocationStock } from '@/lib/location-binding';
import { assertLocationAvailableFor } from '@/lib/location-occupancy';
import { emitWebhook } from '@/lib/webhook';
// F8/F9：商品字段长度与金额边界
import {
  requireProductName, requireProductCode, optionalText, optionalMoney, optionalQty, optionalInt, optionalStatus,
  PRODUCT_LIMITS,
} from '@/lib/product-guard';

export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess('product:view');
    const session = await getSessionChecked();
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '';
    const { page, pageSize, skip } = parsePagination(searchParams);
    const categoryId = searchParams.get('categoryId') || '';
    const status = searchParams.get('status') || '';

    const where: any = { deletedAt: null };
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { barcode: { contains: keyword } },
      ];
    }
    if (categoryId) where.categoryId = Number(categoryId);
    if (status !== '') where.status = Number(status);

    // F6：排序白名单。此前 sort 参数被完全忽略（sort=-id 与 sort=xxx 返回同一顺序），
    // 现在只接受已知字段 + 可选 "-" 前缀，未知值回落默认排序，避免任意字段注入。
    const sortRaw = (searchParams.get('sort') || '').trim();
    const SORTABLE: Record<string, 'asc' | 'desc'> = {
      id: 'desc',
      name: 'asc',
      code: 'asc',
      salePrice: 'asc',
      defaultCost: 'asc',
      createdAt: 'desc',
      updatedAt: 'desc',
    };
    let orderBy: any = { id: 'desc' };
    if (sortRaw) {
      const desc = sortRaw.startsWith('-');
      const field = (desc ? sortRaw.slice(1) : sortRaw).trim();
      if (Object.prototype.hasOwnProperty.call(SORTABLE, field)) {
        orderBy = { [field]: desc ? 'desc' : SORTABLE[field] };
      }
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { 
          category: true, 
          unit: true,
          inventories: {
          where: withWarehouseScope({}, scope),
            include: { warehouse: true },
          },
        },
        skip,
        take: pageSize,
        orderBy,
      }),
      prisma.product.count({ where }),
    ]);

    const itemsWithStock = items.map((item: any) => {
      const totalStock = item.inventories.reduce(
        (sum: number, inv: any) => sum + Number(inv.onHand || 0), 
        0
      );
      return { ...item, totalStock };
    });

    return NextResponse.json({ success: true, data: serializeBigInt({ items: itemsWithStock, total, page, pageSize }) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  await requireAuth(req);
  try {
    const session = await getSessionChecked();
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

    const body = await req.json();
    const {
      name, code, barcode, categoryId, unitId, spec, brand, model,
      safetyStock, maxStock, costMethod, defaultCost, salePrice, remark,
      warehouseId, locationCode, initialStock, initialCost,
      // v1.2.0：保质期决定入库是否强制批次/生产日期，也决定出库 FEFO 是否必须
      shelfLifeDays, leadTimeDays, weight, volume, enableBatch, enableSerial,
    } = body;

    // ---- 参数校验：全部抛 AppError，前端能拿到明确原因 ----
    // F8/F9：长度、负数、1e15 这类越界值全部在落库前拦掉，
    // 不再让 Prisma 抛原始报文（前端此前只能看到「数据库操作失败」）
    const finalName = requireProductName(name);
    const finalCode = requireProductCode(code);
    if (!unitId) throw new AppError('请选择计量单位', 400);

    const finalBarcode = optionalText(barcode, '条码', PRODUCT_LIMITS.barcode) ?? null;
    const finalSpec = optionalText(spec, '规格说明', PRODUCT_LIMITS.spec) ?? null;
    const finalBrand = optionalText(brand, '品牌', PRODUCT_LIMITS.brand) ?? null;
    const finalModel = optionalText(model, '型号', PRODUCT_LIMITS.model) ?? null;
    const finalRemark = optionalText(remark, '备注', PRODUCT_LIMITS.remark) ?? null;
    const finalImageUrl = optionalText(body.imageUrl, '图片地址', PRODUCT_LIMITS.imageUrl) ?? null;
    const finalSalePrice = optionalMoney(salePrice, '销售价') ?? null;
    const finalDefaultCost = optionalMoney(defaultCost, '默认成本') ?? null;
    const finalSafetyStock = optionalQty(safetyStock, '安全库存') ?? null;
    const finalMaxStock = optionalQty(maxStock, '库存上限') ?? null;
    const finalShelfLife = optionalInt(shelfLifeDays, '保质期天数', 0, 3650) ?? null;
    const finalLeadTime = optionalInt(leadTimeDays, '采购周期', 0, 3650) ?? null;
    const finalWeight = optionalMoney(weight, '重量', 1_000_000) ?? null;
    const finalVolume = optionalMoney(volume, '体积', 1_000_000) ?? null;
    const finalStatus = optionalStatus(body.status) ?? 1;

    const existing = await prisma.product.findUnique({ where: { code: finalCode } });
    if (existing) throw new AppError(`商品编码「${finalCode}」已存在，请换一个编码`, 409);

    const stockQtyRaw = optionalQty(initialStock, '初始库存') ?? 0;
    const hasStock = Number.isFinite(stockQtyRaw) && stockQtyRaw > 0;
    const stockQty = stockQtyRaw;
    const costPrice = optionalMoney(initialCost, '初始成本')
      ?? finalDefaultCost
      ?? 0;

    if (hasStock && !warehouseId) throw new AppError('有初始库存时必须选择所属仓库', 400);
    if (hasStock && !locationCode) throw new AppError('有初始库存时必须指定货位', 400);

    let locationCodeNorm = '';
    if (hasStock) {
      try {
        locationCodeNorm = normalizeLocationCode(String(locationCode));
      } catch (e: any) {
        throw new AppError(e?.message || '货位编码格式错误', 400);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. 商品主档
      const product = await tx.product.create({
        data: {
          name: finalName,
          code: finalCode,
          barcode: finalBarcode,
          ...(categoryId ? { category: { connect: { id: BigInt(categoryId) } } } : {}),
          ...(unitId ? { unit: { connect: { id: BigInt(unitId) } } } : {}),
          spec: finalSpec,
          brand: finalBrand,
          model: finalModel,
          safetyStock: finalSafetyStock,
          maxStock: finalMaxStock,
          costMethod: ['WEIGHTED', 'FIFO', 'MONTHLY'].includes(String(costMethod))
            ? String(costMethod)
            : 'WEIGHTED',
          defaultCost: finalDefaultCost,
          salePrice: finalSalePrice,
          shelfLifeDays: finalShelfLife,
          leadTimeDays: finalLeadTime,
          weight: finalWeight,
          volume: finalVolume,
          enableBatch: enableBatch === undefined ? Number(finalShelfLife || 0) > 0 : !!enableBatch,
          enableSerial: !!enableSerial,
          remark: finalRemark,
          status: finalStatus,
          imageUrl: finalImageUrl,
        },
      });

      if (!hasStock) return product;

      // 2. 货位必须真实存在于该仓库（v1.1.1：不再走已废弃的 boxes 表）
      const location = await tx.location.findFirst({
        where: {
          code: locationCodeNorm,
          status: 1,
          zone: { warehouseId: BigInt(warehouseId) },
        },
        select: { id: true, code: true },
      });
      if (!location) {
        throw new AppError(
          `货位「${locationCodeNorm}」在该仓库中不存在，请到「货架地图」确认编码（形如 A-01-01-01）`,
          404
        );
      }

      // 3. 一个货位只能放同一种商品
      await assertLocationAvailableFor(tx, { locationId: location.id, productId: product.id });

      // 4. 批次号
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const lotCount = await tx.inventoryLot.count({
        where: { lotNumber: { startsWith: `LOT-${today}` } },
      });
      const lotNumber = `LOT-${today}-${String(lotCount + 1).padStart(3, '0')}`;

      // 5. 库存主记录（带 locationId，货架地图才能显示）
      const inv = await tx.inventory.create({
        data: {
          productId: product.id,
          warehouseId: BigInt(warehouseId),
          locationId: location.id,
          skuVariantId: 0,
          onHand: stockQty,
          locked: 0,
          available: stockQty,
          avgCost: costPrice > 0 ? costPrice : null,
          version: 0,
        },
      });

      // 6. 货位明细（货架地图读的就是这张表）
      await syncLocationStock(tx, {
        inventoryId: inv.id,
        productId: product.id,
        warehouseId: BigInt(warehouseId),
        locationId: location.id,
        quantity: stockQty,
        lotNumber,
      });

      // 7. 批次
      await tx.inventoryLot.create({
        data: {
          productId: product.id,
          warehouseId: BigInt(warehouseId),
          lotNumber,
          quantity: stockQty,
          costPrice: costPrice > 0 ? costPrice : null,
          status: 1,
        },
      });

      // 8. 初始入库流水
      await tx.inventoryTransaction.create({
        data: {
          txnType: 'INBOUND',
          refType: 'INITIAL',
          refId: product.id,
          refNo: `INIT-${finalCode}`,
          productId: product.id,
          warehouseId: BigInt(warehouseId),
          skuVariantId: 0,
          lotNumber,
          quantity: stockQty,
          costPrice: costPrice > 0 ? costPrice : null,
          beforeQty: 0,
          afterQty: stockQty,
          remark: `初始库存 - 货位 ${location.code} - 批次 ${lotNumber}`,
        },
      });

      return product;
    });

    // v1.2.0：推一次 Webhook（失败不影响主流程）
    void emitWebhook('product.created', {
      productId: String(result.id),
      code: finalCode,
      name: finalName,
      initialStock: hasStock ? stockQty : 0,
      locationCode: hasStock ? locationCodeNorm : null,
    });

    const _p = PLATFORM_NAMES[getClientPlatform()] || getClientPlatform();
    await writeLog({
      module: 'product',
      action: 'create',
      userId: (session.user as any)?.id,
      ip: getClientIp(),
      content: `新建商品 ${finalName} (${finalCode})${hasStock ? `，初始库存 ${stockQty} 存入 ${locationCodeNorm}` : ''} [来源: ${_p}]`,
      refType: 'product',
      refId: result.id,
    });

    return NextResponse.json({ success: true, data: serializeBigInt(result) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
    await requireAuth(req);
  try {
    const session = await getSessionChecked();
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

    const body = await req.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少商品ID' }, { status: 400 });

    // v1.2.4 B：此前 PUT 是裸 Number() 直写库，负售价 / 1e15 / 超长文本 / 带标签的
    // 商品名全部绕过 POST 那套校验落库；现在与 POST / ProductService.update
    // 走同一套 product-guard（长度、去标签、金额数量 >=0 且 <=1,000,000）。
    const data: any = {};
    const toRefId = (v: unknown, field: string): number | null => {
      if (v === null || v === '' || v === undefined) return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw new AppError(`${field}无效`, 400);
      return n;
    };
    if (updateData.name !== undefined) data.name = requireProductName(updateData.name);
    if (updateData.code !== undefined) {
      data.code = requireProductCode(updateData.code);
      const dup = await prisma.product.findUnique({ where: { code: data.code } });
      if (dup && Number(dup.id) !== Number(id)) {
        throw new AppError(`商品编码「${data.code}」已存在，请换一个编码`, 409);
      }
    }
    if (updateData.barcode !== undefined) data.barcode = optionalText(updateData.barcode, '条码', PRODUCT_LIMITS.barcode) ?? null;
    if (updateData.categoryId !== undefined) data.categoryId = toRefId(updateData.categoryId, '分类');
    if (updateData.unitId !== undefined) data.unitId = toRefId(updateData.unitId, '计量单位');
    if (updateData.spec !== undefined) data.spec = optionalText(updateData.spec, '规格说明', PRODUCT_LIMITS.spec) ?? null;
    if (updateData.brand !== undefined) data.brand = optionalText(updateData.brand, '品牌', PRODUCT_LIMITS.brand) ?? null;
    if (updateData.model !== undefined) data.model = optionalText(updateData.model, '型号', PRODUCT_LIMITS.model) ?? null;
    if (updateData.safetyStock !== undefined) data.safetyStock = optionalQty(updateData.safetyStock, '安全库存') ?? null;
    if (updateData.maxStock !== undefined) data.maxStock = optionalQty(updateData.maxStock, '库存上限') ?? null;
    if (updateData.costMethod) {
      if (!['WEIGHTED', 'FIFO', 'MONTHLY'].includes(String(updateData.costMethod))) {
        throw new AppError('成本方法只能是 WEIGHTED、FIFO 或 MONTHLY', 400);
      }
      data.costMethod = String(updateData.costMethod);
    }
    if (updateData.defaultCost !== undefined) data.defaultCost = optionalMoney(updateData.defaultCost, '默认成本') ?? null;
    if (updateData.salePrice !== undefined) data.salePrice = optionalMoney(updateData.salePrice, '销售价') ?? null;
    if (updateData.remark !== undefined) data.remark = optionalText(updateData.remark, '备注', PRODUCT_LIMITS.remark) ?? null;
    if (updateData.status !== undefined) data.status = optionalStatus(updateData.status);
    if (updateData.shelfLifeDays !== undefined) {
      data.shelfLifeDays = optionalInt(updateData.shelfLifeDays, '保质期天数', 0, 3650) ?? null;
    }
    if (updateData.leadTimeDays !== undefined) {
      data.leadTimeDays = optionalInt(updateData.leadTimeDays, '采购周期', 0, 3650) ?? null;
    }
    if (updateData.weight !== undefined) data.weight = optionalMoney(updateData.weight, '重量', 1_000_000) ?? null;
    if (updateData.volume !== undefined) data.volume = optionalMoney(updateData.volume, '体积', 1_000_000) ?? null;
    if (updateData.imageUrl !== undefined) data.imageUrl = optionalText(updateData.imageUrl, '图片地址', PRODUCT_LIMITS.imageUrl) ?? null;
    if (updateData.enableSerial !== undefined) data.enableSerial = !!updateData.enableSerial;
    if (updateData.enableBatch !== undefined) data.enableBatch = !!updateData.enableBatch;

    const product = await prisma.product.update({
      where: { id: Number(id) },
      data,
    });

    const _p2 = PLATFORM_NAMES[getClientPlatform()] || getClientPlatform(); await writeLog({ module: 'product', action: 'update', ip: getClientIp(), content: `编辑商品 ID:${id} [来源: ${_p2}]`, refType: 'product', refId: Number(id) });
    return NextResponse.json({ success: true, data: serializeBigInt(product) });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
    await requireAuth(req);
  try {
    const session = await getSessionChecked();
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

    const { searchParams} = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少商品ID' }, { status: 400 });

    const productId = Number(id);

    const inventories = await prisma.inventory.findMany({ where: { productId } });
    const totalStock = inventories.reduce((sum, inv) => sum + Number(inv.onHand || 0), 0);
    if (totalStock > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `该商品还有库存 ${totalStock}，无法删除。请先清空库存。` 
      }, { status: 400 });
    }

    // v1.2.0：改为软删除（回收站可恢复），历史单据与流水一律保留
    await prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date() },
    });

    const _p3 = PLATFORM_NAMES[getClientPlatform()] || getClientPlatform(); await writeLog({ module: 'product', action: 'delete', ip: getClientIp(), content: `删除商品 ID:${productId} [来源: ${_p3}]`, refType: 'product', refId: productId });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
