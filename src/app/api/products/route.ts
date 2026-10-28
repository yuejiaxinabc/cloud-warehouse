import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp, getClientPlatform, PLATFORM_NAMES } from '@/lib/log';
import { requireAuth } from '@/lib/auth-guard';
import { AppError, handleApiError } from '@/lib/errors';
import { normalizeLocationCode, syncLocationStock } from '@/lib/location-binding';
import { assertLocationAvailableFor } from '@/lib/location-occupancy';

export async function GET(req: NextRequest) {
    await requireAuth(req);
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const categoryId = searchParams.get('categoryId') || '';
    const status = searchParams.get('status') || '';

    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
        { barcode: { contains: keyword } },
      ];
    }
    if (categoryId) where.categoryId = Number(categoryId);
    if (status !== '') where.status = Number(status);

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { 
          category: true, 
          unit: true,
          inventories: {
            include: { warehouse: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

    const body = await req.json();
    const {
      name, code, barcode, categoryId, unitId, spec, brand, model,
      safetyStock, maxStock, costMethod, defaultCost, salePrice, remark,
      warehouseId, locationCode, initialStock, initialCost,
    } = body;

    // ---- 参数校验：全部抛 AppError，前端能拿到明确原因 ----
    if (!name || !String(name).trim()) throw new AppError('请填写商品名称', 400);
    if (!code || !String(code).trim()) throw new AppError('请填写商品编码', 400);
    if (!unitId) throw new AppError('请选择计量单位', 400);

    const finalCode = String(code).trim();

    const existing = await prisma.product.findUnique({ where: { code: finalCode } });
    if (existing) throw new AppError(`商品编码「${finalCode}」已存在，请换一个编码`, 409);

    const stockQty = Number(initialStock ?? 0);
    const hasStock = Number.isFinite(stockQty) && stockQty > 0;
    const costPrice = Number(initialCost || defaultCost || 0);

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
          name: String(name).trim(),
          code: finalCode,
          barcode: barcode || null,
          ...(categoryId ? { category: { connect: { id: BigInt(categoryId) } } } : {}),
          ...(unitId ? { unit: { connect: { id: BigInt(unitId) } } } : {}),
          spec: spec || null,
          brand: brand || null,
          model: model || null,
          safetyStock: safetyStock !== undefined && safetyStock !== null ? Number(safetyStock) : null,
          maxStock: maxStock !== undefined && maxStock !== null ? Number(maxStock) : null,
          costMethod: costMethod || 'WEIGHTED',
          defaultCost: defaultCost !== undefined && defaultCost !== null ? Number(defaultCost) : null,
          salePrice: salePrice !== undefined && salePrice !== null ? Number(salePrice) : null,
          remark: remark || null,
          status: body.status !== undefined ? Number(body.status) : 1,
          imageUrl: body.imageUrl || null,
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

    const _p = PLATFORM_NAMES[getClientPlatform()] || getClientPlatform();
    await writeLog({
      module: 'product',
      action: 'create',
      userId: (session.user as any)?.id,
      ip: getClientIp(),
      content: `新建商品 ${name} (${finalCode})${hasStock ? `，初始库存 ${stockQty} 存入 ${locationCodeNorm}` : ''} [来源: ${_p}]`,
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

    const body = await req.json();
    const { id, ...updateData } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少商品ID' }, { status: 400 });

    const data: any = {};
    if (updateData.name !== undefined) data.name = updateData.name;
    if (updateData.code !== undefined) data.code = updateData.code;
    if (updateData.barcode !== undefined) data.barcode = updateData.barcode || null;
    if (updateData.categoryId !== undefined) data.categoryId = updateData.categoryId ? Number(updateData.categoryId) : null;
    if (updateData.unitId !== undefined) data.unitId = updateData.unitId ? Number(updateData.unitId) : null;
    if (updateData.spec !== undefined) data.spec = updateData.spec || null;
    if (updateData.brand !== undefined) data.brand = updateData.brand || null;
    if (updateData.model !== undefined) data.model = updateData.model || null;
    if (updateData.safetyStock !== undefined) data.safetyStock = updateData.safetyStock ? Number(updateData.safetyStock) : null;
    if (updateData.maxStock !== undefined) data.maxStock = updateData.maxStock ? Number(updateData.maxStock) : null;
    if (updateData.costMethod) data.costMethod = updateData.costMethod;
    if (updateData.defaultCost !== undefined) data.defaultCost = updateData.defaultCost ? Number(updateData.defaultCost) : null;
    if (updateData.salePrice !== undefined) data.salePrice = updateData.salePrice ? Number(updateData.salePrice) : null;
    if (updateData.remark !== undefined) data.remark = updateData.remark || null;
    if (updateData.status !== undefined) data.status = Number(updateData.status);
    if (updateData.imageUrl !== undefined) data.imageUrl = updateData.imageUrl || null;

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
    const session = await getServerSession(authOptions);
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

    await prisma.$transaction(async (tx) => {
      await tx.inventoryTransaction.deleteMany({ where: { productId } });
      await tx.inventoryLot.deleteMany({ where: { productId } });
      await tx.locationStock.deleteMany({ where: { productId } });
      await tx.inventory.deleteMany({ where: { productId } });
      await tx.costSnapshot.deleteMany({ where: { productId } });
      await tx.productCostSetting.deleteMany({ where: { productId } });
      await tx.bomItem.deleteMany({ where: { productId } });
      await tx.countItem.deleteMany({ where: { productId } });
      await tx.transferItem.deleteMany({ where: { productId } });
      await tx.outboundItem.deleteMany({ where: { productId } });
      await tx.inboundItem.deleteMany({ where: { productId } });
      await tx.purchaseItem.deleteMany({ where: { productId } });
      await tx.salesItem.deleteMany({ where: { productId } });
      await tx.productSupplier.deleteMany({ where: { productId } });
      await tx.serialNumber.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });

    const _p3 = PLATFORM_NAMES[getClientPlatform()] || getClientPlatform(); await writeLog({ module: 'product', action: 'delete', ip: getClientIp(), content: `删除商品 ID:${productId} [来源: ${_p3}]`, refType: 'product', refId: productId });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
