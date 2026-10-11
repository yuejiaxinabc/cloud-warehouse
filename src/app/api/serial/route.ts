import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

/**
 * GET /api/serial - 序列号/商品变动追踪查询
 * 查询逻辑：按序列号、商品编码、商品名称、入库单号查询
 * 返回该商品的所有变动记录（入库、出库、调拨、盘点等）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    if (!keyword) {
      return NextResponse.json({ success: true, data: { list: [], total: 0 } });
    }

    // 1. 先查找匹配的商品
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { code: { contains: keyword } },
          { name: { contains: keyword } },
          { barcode: { contains: keyword } },
        ],
      },
      select: { id: true, code: true, name: true },
    });

    const productIds = products.map(p => p.id);

    // 2. 查找匹配的序列号
    const serials = await prisma.serialNumber.findMany({
      where: {
        OR: [
          { serialNo: { contains: keyword } },
          { lotNumber: { contains: keyword } },
          { productId: { in: productIds.length > 0 ? productIds : [0] } },
        ],
      },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 3. 查找匹配的库存流水（所有变动）
    const transactions = await prisma.inventoryTransaction.findMany({
      where: {
        OR: [
          { refNo: { contains: keyword } },
          { lotNumber: { contains: keyword } },
          { productId: { in: productIds.length > 0 ? productIds : [0] } },
        ],
      },
      orderBy: { txnTime: 'desc' },
      take: 100,
    });

    // 获取商品信息
    const allProductIds = [...new Set(transactions.map(t => Number(t.productId)))];
    const productsInfo = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, code: true, name: true },
    });
    const productsMap = new Map(productsInfo.map(p => [Number(p.id), p]));

    // 4. 合并结果，按商品分组
    const resultMap = new Map();

    // 处理序列号记录
    for (const serial of serials) {
      const pid = Number(serial.productId);
      if (!resultMap.has(pid)) {
        resultMap.set(pid, {
          productId: pid,
          productCode: serial.product?.code || '-',
          productName: serial.product?.name || '-',
          serials: [],
          transactions: [],
        });
      }
      resultMap.get(pid).serials.push({
        serialNo: serial.serialNo,
        lotNumber: serial.lotNumber,
        status: serial.status,
        warehouseId: serial.warehouseId,
        createdAt: serial.createdAt,
      });
    }

    // 处理流水记录
    for (const txn of transactions) {
      const pid = Number(txn.productId);
      const product = productsMap.get(pid);
      if (!resultMap.has(pid)) {
        resultMap.set(pid, {
          productId: pid,
          productCode: product?.code || '-',
          productName: product?.name || '-',
          serials: [],
          transactions: [],
        });
      }
      resultMap.get(pid).transactions.push({
        id: Number(txn.id),
        txnType: txn.txnType,
        refNo: txn.refNo,
        lotNumber: txn.lotNumber,
        quantity: Number(txn.quantity || 0),
        costPrice: Number(txn.costPrice || 0),
        amount: Number(txn.quantity || 0) * Number(txn.costPrice || 0),
        beforeQty: Number(txn.beforeQty || 0),
        afterQty: Number(txn.afterQty || 0),
        txnTime: txn.txnTime,
        warehouseId: txn.warehouseId,
      });
    }

    // 转为数组并分页
    const allItems = Array.from(resultMap.values());
    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const list = allItems.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      data: serializeBigInt({ list, total, page, pageSize }),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/serial - 手动创建序列号
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sn, productId, warehouseId, batchNo, status } = body;

    if (!sn || !productId) {
      return NextResponse.json({ success: false, error: '序列号和商品为必填' }, { status: 400 });
    }

    const existing = await prisma.serialNumber.findUnique({ where: { serialNo: sn } });
    if (existing) {
      return NextResponse.json({ success: false, error: '序列号已存在' }, { status: 400 });
    }

    const serial = await prisma.serialNumber.create({
      data: {
        serialNo: sn,
        productId: Number(productId),
        warehouseId: warehouseId ? Number(warehouseId) : null,
        lotNumber: batchNo || null,
        status: status || 'IN_STOCK',
      },
    });

    return NextResponse.json({ success: true, data: serializeBigInt({ ...serial, sn: serial.serialNo }) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
