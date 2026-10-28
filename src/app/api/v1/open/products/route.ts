import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOpenApi } from '@/lib/open-api-auth';

/** GET /api/v1/open/products?page=1&pageSize=100&updatedSince=ISO  —— 对外商品主数据 + 库存 */
export async function GET(req: NextRequest) {
  const auth = await requireOpenApi(req);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error || 'Token 无效' }, { status: 401 });

  try {
    const sp = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') || '100', 10)));
    const since = sp.get('updatedSince');
    const keyword = (sp.get('keyword') || '').trim();

    const where: any = { deletedAt: null };
    if (since) where.updatedAt = { gte: new Date(since) };
    if (keyword) where.OR = [{ code: { contains: keyword } }, { name: { contains: keyword } }, { barcode: { contains: keyword } }];

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { unit: { select: { name: true } }, category: { select: { name: true } }, inventories: true },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        page,
        pageSize,
        items: items.map((p: any) => ({
          id: String(p.id),
          code: p.code,
          name: p.name,
          barcode: p.barcode,
          unit: p.unit?.name || null,
          category: p.category?.name || null,
          spec: p.spec,
          status: p.status,
          safetyStock: p.safetyStock ? Number(p.safetyStock) : null,
          stock: p.inventories.reduce((s: number, i: any) => s + Number(i.onHand || 0), 0),
          available: p.inventories.reduce((s: number, i: any) => s + Number(i.onHand || 0) - Number(i.locked || 0), 0),
          updatedAt: p.updatedAt,
        })),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '查询失败' }, { status: 500 });
  }
}
