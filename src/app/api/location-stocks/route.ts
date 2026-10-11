import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

// POST - 分配/挪动货位
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });

    const body = await req.json();
    const { productId, warehouseId, locationId, boxId, quantity, lotNumber } = body;

    if (!productId || !warehouseId || !locationId || !quantity || Number(quantity) <= 0) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }

    // 查找 inventory
    let inventory = await prisma.inventory.findUnique({
      where: {
        productId_warehouseId_skuVariantId: {
          productId: Number(productId),
          warehouseId: Number(warehouseId),
          skuVariantId: 0,
        },
      },
    });

    if (!inventory) {
      inventory = await prisma.inventory.create({
        data: {
          productId: Number(productId),
          warehouseId: Number(warehouseId),
          skuVariantId: 0,
          onHand: 0,
          avgCost: 0,
        },
      });
    }

    const moveQty = Number(quantity);
    const targetBoxId = boxId ? Number(boxId) : null;
    const targetLocationId = Number(locationId);

    // 自动填充批次号：从 inventoryLots 取最新的批次
    let effectiveLotNumber = lotNumber || null;
    if (!effectiveLotNumber) {
      const latestLot = await prisma.inventoryLot.findFirst({
        where: { productId: Number(productId), warehouseId: Number(warehouseId) },
        orderBy: { id: 'desc' },
        select: { lotNumber: true },
      });
      if (latestLot) effectiveLotNumber = latestLot.lotNumber;
    }

    // 查找该商品在这个仓库已有的所有货位记录
    const existingRecords = await prisma.locationStock.findMany({
      where: {
        inventoryId: inventory.id,
        productId: Number(productId),
        warehouseId: Number(warehouseId),
      },
      orderBy: { id: 'asc' },
    });

    // 看目标盒子是否已有记录
    const targetRecord = existingRecords.find(r =>
      Number(r.locationId) === targetLocationId &&
      (r.boxId ? Number(r.boxId) : null) === targetBoxId
    );

    if (targetRecord) {
      // 目标盒子已有记录 → 累加
      await prisma.locationStock.update({
        where: { id: targetRecord.id },
        data: { quantity: { increment: moveQty } },
      });
    } else {
      // 目标盒子没有记录 → 从旧盒子减，新盒子加
      // 找旧盒子（排除目标盒子之外的记录）
      const otherRecords = existingRecords.filter(r =>
        !(Number(r.locationId) === targetLocationId && (r.boxId ? Number(r.boxId) : null) === targetBoxId)
      );

      // 从第一个旧记录扣减
      if (otherRecords.length > 0) {
        const oldRecord = otherRecords[0];
        const oldQty = Number(oldRecord.quantity);
        const remain = oldQty - moveQty;

        if (remain <= 0) {
          // 全部挪走，删旧建新
          await prisma.locationStock.delete({ where: { id: oldRecord.id } });
        } else {
          // 部分挪走，旧记录减数量
          await prisma.locationStock.update({
            where: { id: oldRecord.id },
            data: { quantity: remain },
          });
        }
      }

      // 创建新盒子记录
      await prisma.locationStock.create({
        data: {
          inventoryId: inventory.id,
          productId: Number(productId),
          warehouseId: Number(warehouseId),
          locationId: targetLocationId,
          boxId: targetBoxId,
          lotNumber: effectiveLotNumber,
          quantity: moveQty,
        },
      });
    }

    return NextResponse.json({ success: true, message: '货位分配成功' });
  } catch (error: any) {
    console.error('[LocationStock POST] Error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}

// GET - 查询货位库存
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get('warehouseId');
    const productId = searchParams.get('productId');

    const where: any = {};
    if (warehouseId) where.warehouseId = Number(warehouseId);
    if (productId) where.productId = Number(productId);

    const stocks = await prisma.locationStock.findMany({
      where,
      include: {
        location: { select: { id: true, code: true, name: true } },
        product: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(serializeBigInt({ success: true, data: stocks }));
  } catch (error: any) {
    console.error('[LocationStock GET] Error:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}
