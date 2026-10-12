import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp, getClientPlatform, PLATFORM_NAMES } from '@/lib/log';
import { requireAuth } from '@/lib/auth-guard';

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
      warehouseId, locationId, locationCode, initialStock, initialCost
    } = body;

    if (!name || !code) {
      return NextResponse.json({ success: false, error: '商品编码和名称必填' }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ success: false, error: '商品编码已存在' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建商品
      const product = await tx.product.create({
        data: {
          name, code, barcode: barcode || null,
          ...(categoryId ? { category: { connect: { id: BigInt(categoryId) } } } : {}),
          ...(unitId ? { unit: { connect: { id: BigInt(unitId) } } } : {}),
          spec: spec || null, brand: brand || null, model: model || null,
          safetyStock: safetyStock ? Number(safetyStock) : null,
          maxStock: maxStock ? Number(maxStock) : null,
          costMethod: costMethod || 'WEIGHTED',
          defaultCost: defaultCost ? Number(defaultCost) : null,
          salePrice: salePrice ? Number(salePrice) : null,
          remark: remark || null, status: 1,
          imageUrl: body.imageUrl || null,
        },
      });

      // 2. 如果有初始库存，手动选货位（每货位=1种商品，不限数量）
      if (warehouseId && (locationId || locationCode) && initialStock && Number(initialStock) > 0) {
        const stockQty = Number(initialStock);
        const costPrice = initialCost ? Number(initialCost) : (defaultCost ? Number(defaultCost) : 0);

        // 查找货位和货位（支持 4 段编码 A-1-1-1 或 3 段 A-1-1）
        let location: any;
        let targetBox: any;
        if (locationCode) {
          const code = locationCode.trim();
          const parts = code.split('-');
          let locCode = code;
          let boxCode = '';
          
          if (parts.length === 4) {
            // 4 段编码：最后一段是货位编号
            locCode = parts.slice(0, 3).join('-');
            boxCode = code;
          } else if (parts.length === 3) {
            // 3 段编码：自动找空闲货位
            locCode = code;
            boxCode = '';
          } else {
            throw new Error('货位编码格式错误，应为 A-1-1-1（货架-列-层-盒）');
          }

          // 查找货位
          location = await tx.location.findFirst({
            where: {
              code: locCode,
              status: 1,
              zone: { warehouseId: BigInt(warehouseId) },
            },
          });
          if (!location) {
            throw new Error('货位 ' + locCode + ' 不存在或已停用');
          }

          if (boxCode) {
            // 4 段编码：找指定货位
            targetBox = await tx.box.findFirst({
              where: {
                locationId: location.id,
                code: boxCode,
                status: 1,
              },
            });
            if (!targetBox) {
              throw new Error('货位 ' + boxCode + ' 不存在或已停用');
            }
            if (targetBox.remark && targetBox.remark.trim() !== '') {
              throw new Error('货位 ' + boxCode + ' 已被占用（' + targetBox.remark + '）');
            }
          } else {
            // 3 段编码：找空闲货位
            targetBox = await tx.box.findFirst({
              where: {
                locationId: location.id,
                status: 1,
                OR: [{ remark: null }, { remark: '' }],
              },
              orderBy: { code: 'asc' },
            });
            if (!targetBox) {
              throw new Error('货位 ' + locCode + ' 没有空闲货位');
            }
          }
        } else if (locationId) {
          location = await tx.location.findFirst({
            where: {
              id: BigInt(locationId),
              status: 1,
              zone: { warehouseId: BigInt(warehouseId) },
            },
          });
          if (location) {
            targetBox = await tx.box.findFirst({
              where: {
                locationId: location.id,
                status: 1,
                OR: [{ remark: null }, { remark: '' }],
              },
              orderBy: { code: 'asc' },
            });
          }
        }
        if (!location) {
          throw new Error('货位不存在或已停用');
        }
        if (!targetBox) {
          throw new Error('没有可用的空闲货位');
        }

        // 标记货位已占用（记录商品ID）
        await tx.box.update({
          where: { id: targetBox.id },
          data: { remark: `product:${product.id}` },
        });

        // 自动生成批次号
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const lotCount = await tx.inventoryLot.count({
          where: { lotNumber: { startsWith: `LOT-${today}` } },
        });
        const lotNumber = `LOT-${today}-${String(lotCount + 1).padStart(3, '0')}`;

        // 创建聚合库存记录（一个商品+一个仓库=一条）
        const inv = await tx.inventory.create({
          data: {
            productId: product.id,
            warehouseId: BigInt(warehouseId),
            skuVariantId: 0,
            onHand: stockQty,
            locked: 0,
            available: stockQty,
            avgCost: costPrice > 0 ? costPrice : null,
            version: 0,
          },
        });

        // 创建货位明细（一个货位=一种商品，不限数量）
        await tx.locationStock.create({
          data: {
            inventoryId: inv.id,
            productId: product.id,
            warehouseId: BigInt(warehouseId),
            locationId: location.id,
            lotNumber,
            quantity: stockQty,
          },
        });

        // 创建批次记录
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

        // 创建入库流水
        await tx.inventoryTransaction.create({
          data: {
            txnType: 'INBOUND',
            refType: 'INITIAL',
            refId: product.id,
            refNo: `INIT-${code}`,
            productId: product.id,
            warehouseId: BigInt(warehouseId),
            skuVariantId: 0,
            lotNumber,
            quantity: stockQty,
            costPrice: costPrice > 0 ? costPrice : null,
            beforeQty: 0,
            afterQty: stockQty,
            remark: `初始库存 - 批次 ${lotNumber}`,
          },
        });
      }

      return product;
    });

    const _p = PLATFORM_NAMES[await getClientPlatform()] || await getClientPlatform(); await writeLog({ module: 'product', action: 'create', ip: await getClientIp(), content: `新建商品 ${name} (${code}) [来源: ${_p}]`, refType: 'product', refId: result.id });
    return NextResponse.json({ success: true, data: serializeBigInt(result) });
  } catch (error: any) {
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

    const _p2 = PLATFORM_NAMES[await getClientPlatform()] || await getClientPlatform(); await writeLog({ module: 'product', action: 'update', ip: await getClientIp(), content: `编辑商品 ID:${id} [来源: ${_p2}]`, refType: 'product', refId: Number(id) });
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

    const _p3 = PLATFORM_NAMES[await getClientPlatform()] || await getClientPlatform(); await writeLog({ module: 'product', action: 'delete', ip: await getClientIp(), content: `删除商品 ID:${productId} [来源: ${_p3}]`, refType: 'product', refId: productId });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
