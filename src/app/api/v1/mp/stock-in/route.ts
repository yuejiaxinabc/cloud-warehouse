import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';
import { StockInService } from '@/services/stock-in.service';

/**
 * POST /api/v1/mp/stock-in - 扫码入库
 * body: { code, quantity, warehouseId, locationId, boxId?, remark? }
 * 自动创建入库单并过账，库存写入指定货位/盒子
 */
export async function POST(req: NextRequest) {
  try {
    await requireMpToken(req);
    const body = await req.json();
    const { code, quantity, warehouseId, locationId, boxId, remark } = body;

    if (!code || !quantity || !warehouseId || !locationId) {
      return NextResponse.json({ success: false, error: '缺少必填参数（编码/数量/仓库/货位）' }, { status: 400 });
    }
    const qty = Number(quantity);
    if (qty <= 0) {
      return NextResponse.json({ success: false, error: '数量必须大于 0' }, { status: 400 });
    }

    // 查商品：条码/编码/序列号
    let product = await prisma.product.findFirst({
      where: { OR: [{ barcode: code }, { code: code }] },
    });
    if (!product) {
      const serial = await prisma.serialNumber.findFirst({ where: { serialNo: code } });
      if (serial) {
        product = await prisma.product.findUnique({ where: { id: serial.productId } });
      }
    }
    if (!product) {
      return NextResponse.json({ success: false, error: `未找到编码为 ${code} 的商品` }, { status: 404 });
    }

    // 创建入库单并过账
    const order = await StockInService.create({
      type: 'OTHER',
      warehouseId: Number(warehouseId),
      remark: remark || '小程序扫码入库',
      items: [{ productId: Number(product.id), quantity: qty }],
    });
    await StockInService.post(Number(order.id));

    // 写货位/盒子库存
    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_warehouseId_skuVariantId: {
          productId: product.id,
          warehouseId: BigInt(Number(warehouseId)),
          skuVariantId: 0,
        },
      },
    });
    let boxCode = '';
    if (inventory) {
      const targetBoxId = boxId ? Number(boxId) : null;
      if (targetBoxId) {
        const box = await prisma.box.findUnique({ where: { id: targetBoxId }, select: { code: true } });
        boxCode = box?.code || '';
      }
      const existingLocStock = await prisma.locationStock.findFirst({
        where: {
          inventoryId: inventory.id,
          locationId: BigInt(Number(locationId)),
          boxId: targetBoxId !== null ? BigInt(targetBoxId) : null,
        },
      });
      const latestLot = await prisma.inventoryLot.findFirst({
        where: { productId: product.id, warehouseId: BigInt(Number(warehouseId)) },
        orderBy: { id: 'desc' },
        select: { lotNumber: true },
      });

      if (existingLocStock) {
        await prisma.locationStock.update({
          where: { id: existingLocStock.id },
          data: { quantity: { increment: qty } },
        });
      } else {
        await prisma.locationStock.create({
          data: {
            inventoryId: inventory.id,
            productId: product.id,
            warehouseId: BigInt(Number(warehouseId)),
            locationId: BigInt(Number(locationId)),
            boxId: targetBoxId !== null ? BigInt(targetBoxId) : null,
            lotNumber: latestLot?.lotNumber || null,
            quantity: qty,
          },
        });
      }
    }

    return NextResponse.json(serializeBigInt({
      success: true,
      data: { orderNo: order.orderNo, productName: product.name, quantity: qty, boxCode },
      message: `入库成功（${order.orderNo}）`,
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
