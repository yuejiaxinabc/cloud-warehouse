import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOpenApiAccess } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

/** GET /api/v1/open/movements?since=ISO&page=1&pageSize=100 —— 对外库存流水（增量同步用） */
export async function GET(req: NextRequest) {
  try {
    // P1-4：鉴权移进 try，表缺失 → 503 可读 JSON
    const guard = await requireOpenApiAccess(req);
    if (!guard.ok) return NextResponse.json(guard.body, { status: guard.status });

    const sp = req.nextUrl.searchParams;
    const since = sp.get('since');
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(sp.get('pageSize') || '100', 10)));

    const where: any = {};
    if (since) where.createdAt = { gte: new Date(since) };

    const [raw, total] = await Promise.all([
      // 注意：inventory_transactions 没有定义关系字段，这里走 Map 补名称
      prisma.inventoryTransaction.findMany({
        where,
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);

    const [products, warehouses] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: [...new Set(raw.map((r) => r.productId))] } },
        select: { id: true, code: true, name: true },
      }),
      prisma.warehouse.findMany({
        where: { id: { in: [...new Set(raw.map((r) => r.warehouseId))] } },
        select: { id: true, code: true },
      }),
    ]);
    const pMap = new Map(products.map((p) => [String(p.id), p]));
    const wMap = new Map(warehouses.map((w) => [String(w.id), w]));
    const items = raw.map((t: any) => ({
      ...t,
      product: pMap.get(String(t.productId)) || null,
      warehouse: wMap.get(String(t.warehouseId)) || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        total, page, pageSize,
        items: items.map((t: any) => ({
          id: String(t.id),
          type: t.txnType,
          refType: t.refType,
          refNo: t.refNo,
          productCode: t.product?.code,
          warehouseCode: t.warehouse?.code,
          lotNumber: t.lotNumber,
          quantity: Number(t.quantity),
          costPrice: t.costPrice ? Number(t.costPrice) : null,
          afterQty: t.afterQty ? Number(t.afterQty) : null,
          createdAt: t.txnTime || t.createdAt,
        })),
      },
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}