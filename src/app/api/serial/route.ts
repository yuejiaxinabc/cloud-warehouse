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

    // FIX-2026-1015：原来没有关键词就直接返回空数组，
    // 页面进来一片空白，看起来像「有商品却没有追踪」。
    // 现在无关键词时返回全部商品（附各自的序列号与流水），有关键词再过滤。
    const hasKeyword = !!keyword.trim();

    const products = await prisma.product.findMany({
      where: hasKeyword
        ? {
            OR: [
              { code: { contains: keyword } },
              { name: { contains: keyword } },
              { barcode: { contains: keyword } },
              // 允许直接用批次号/序列号反查商品
              { inventoryLots: { some: { lotNumber: { contains: keyword } } } },
              { serialNumbers: { some: { serialNo: { contains: keyword } } } },
            ],
          }
        : undefined,
      select: { id: true, code: true, name: true },
      orderBy: { id: 'asc' },
      take: 500,
    });

    const productIds = products.map(p => p.id);

    // 2. 查找匹配的序列号
    const serials = await prisma.serialNumber.findMany({
      where: hasKeyword
        ? {
            OR: [
              { serialNo: { contains: keyword } },
              { lotNumber: { contains: keyword } },
              { productId: { in: productIds.length > 0 ? productIds : [0] } },
            ],
          }
        : { productId: { in: productIds.length > 0 ? productIds : [0] } },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // 3. 查找匹配的库存流水（所有变动）
    const transactions = await prisma.inventoryTransaction.findMany({
      where: hasKeyword
        ? {
            OR: [
              { refNo: { contains: keyword } },
              { lotNumber: { contains: keyword } },
              { productId: { in: productIds.length > 0 ? productIds : [0] } },
            ],
          }
        : { productId: { in: productIds.length > 0 ? productIds : [0] } },
      orderBy: { txnTime: 'desc' },
      take: 500,
    });

    // 获取商品信息
    const allProductIds = [...new Set(transactions.map(t => Number(t.productId)))];
    const productsInfo = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, code: true, name: true },
    });
    const productsMap = new Map(productsInfo.map(p => [Number(p.id), p]));

    // 4. 合并结果，按商品分组
    //    先按商品打底：只要商品存在就出现在列表里（哪怕还没有任何流水），
    //    这样「有商品就有追踪」这件事在界面上是成立的。
    const resultMap = new Map();
    for (const p of products) {
      const pid = Number(p.id);
      resultMap.set(pid, {
        productId: pid,
        productCode: p.code,
        productName: p.name,
        serials: [],
        transactions: [],
      });
    }

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

    // 汇总每个商品的批次号（FIX-2026-1021：列表里要能直接看到批次号）
    // 批次的主数据在 inventory_lots，流水/序列号只是引用，三者都要取。
    const lotRows = productIds.length
      ? await prisma.inventoryLot.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true, lotNumber: true, quantity: true, expiredAt: true },
          orderBy: { id: 'desc' },
          take: 2000,
        })
      : [];
    const lotByProduct = new Map<string, string[]>();
    for (const r of lotRows) {
      if (!r.lotNumber) continue;
      const k = r.productId.toString();
      const arr = lotByProduct.get(k) || [];
      if (!arr.includes(r.lotNumber)) arr.push(r.lotNumber);
      lotByProduct.set(k, arr);
    }

    for (const item of resultMap.values()) {
      const lots = new Set<string>(lotByProduct.get(String(item.productId)) || []);
      for (const s of item.serials) if (s.lotNumber) lots.add(s.lotNumber);
      for (const t of item.transactions) if (t.lotNumber) lots.add(t.lotNumber);
      item.lots = Array.from(lots);
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
