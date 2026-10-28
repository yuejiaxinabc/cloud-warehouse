import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';

/**
 * GET /api/inventory/lots
 *
 * v1.2 批次台账：把批次号 + 生产日期 + 到期日期当一等公民暴露出来，
 * 供「批次与效期」页和临期预警使用。
 *
 * 参数：warehouseId / productId / keyword / expiringDays / onlyExpired / page / pageSize
 */
export async function GET(req: NextRequest) {
  await requireAuth(req);
  try {
    const sp = req.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const productId = sp.get('productId');
    const keyword = (sp.get('keyword') || '').trim();
    const expiringDays = parseInt(sp.get('expiringDays') || '0', 10);
    const onlyExpired = sp.get('onlyExpired') === '1';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') || '20', 10)));

    const where: any = {};
    if (warehouseId) where.warehouseId = BigInt(warehouseId);
    if (productId) where.productId = BigInt(productId);
    if (keyword) {
      where.OR = [
        { lotNumber: { contains: keyword } },
        { product: { code: { contains: keyword } } },
        { product: { name: { contains: keyword } } },
      ];
    }

    const now = new Date();
    if (onlyExpired) {
      where.expiredAt = { not: null, lt: now };
    } else if (expiringDays > 0) {
      const until = new Date(now.getTime() + expiringDays * 24 * 3600 * 1000);
      where.expiredAt = { not: null, lte: until };
    }

    const [items, total] = await Promise.all([
      prisma.inventoryLot.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true, shelfLifeDays: true, unit: { select: { name: true } } } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: [{ expiredAt: 'asc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryLot.count({ where }),
    ]);

    const rows = items.map((lot: any) => {
      const daysLeft = lot.expiredAt
        ? Math.ceil((new Date(lot.expiredAt).getTime() - now.getTime()) / 86400000)
        : null;
      return {
        ...lot,
        daysLeft,
        // 1-正常 2-临近 3-已过期（临期阈值默认 30 天）
        expiryState: lot.expiredAt == null ? 'none' : daysLeft! < 0 ? 'expired' : daysLeft! <= 30 ? 'soon' : 'ok',
        // 2 = 冻结
        frozen: lot.status === 2,
      };
    });

    return NextResponse.json(serializeBigInt({ success: true, data: { items: rows, total, page, pageSize } }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '批次查询失败' }, { status: 500 });
  }
}
