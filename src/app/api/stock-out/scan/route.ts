import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

/**
 * POST /api/stock-out/scan - 扫码查询商品
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: '请输入条码或序列号' }, { status: 400 });
    }

    // 1. 先按条码查找商品
    let product = await prisma.product.findFirst({
      where: {
        OR: [
          { barcode: code },
          { code: code },
        ],
      },
    });

    // 2. 如果没找到，按序列号查找
    if (!product) {
      const serial = await prisma.serialNumber.findFirst({
        where: { serialNo: code },
        include: { product: true },
      });
      if (serial) {
        product = serial.product;
      }
    }

    if (!product) {
      return NextResponse.json({ success: false, error: '未找到商品' }, { status: 404 });
    }

    // 3. 查询该商品的库存
    const inventories = await prisma.inventory.findMany({
      where: { productId: product.id },
      include: { warehouse: true },
    });

    let totalStock = 0;
    let warehouseId = null;
    let warehouseName = '';
    inventories.forEach(inv => {
      const qty = Number(inv.onHand || 0);
      totalStock += qty;
      if (qty > 0 && !warehouseId) {
        warehouseId = Number(inv.warehouseId);
        warehouseName = inv.warehouse?.name || '';
      }
    });

    return NextResponse.json({
      success: true,
      data: serializeBigInt({
        productId: Number(product.id),
        productName: product.name,
        sku: product.code,
        barcode: product.barcode || '',
        stock: totalStock,
        warehouseId,
        warehouseName,
      }),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
