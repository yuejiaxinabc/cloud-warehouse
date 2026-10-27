import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { buildTemplate } from '@/lib/product-excel';

/**
 * GET /api/products/template
 * 生成商品导入模板（是否含仓库/货位列，取决于系统里有没有仓库）
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const warehouses = await prisma.warehouse.findMany({
      where: { status: 1 },
      select: { name: true, code: true },
      orderBy: { id: 'asc' },
    });

    const buf = await buildTemplate({
      hasWarehouse: warehouses.length > 0,
      warehouses,
    });

    const filename = `商品导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const encoded = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="product_template.xlsx"; filename*=UTF-8''${encoded}`,
        'Content-Length': String(buf.byteLength),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
