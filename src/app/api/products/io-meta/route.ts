import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/products/io-meta
 * 导入导出页需要的环境信息：系统里到底有没有仓库。
 * 有仓库 → 模板带「仓库 / 货位编码」列并强制填写；
 * 没仓库 → 模板不带这两列。
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const warehouses = await prisma.warehouse.findMany({
      where: { status: 1 },
      select: { id: true, name: true, code: true },
      orderBy: { id: 'asc' },
    });
    const productCount = await prisma.product.count();

    return NextResponse.json({
      success: true,
      data: {
        hasWarehouse: warehouses.length > 0,
        warehouseCount: warehouses.length,
        warehouses: warehouses.map(w => ({ id: w.id.toString(), name: w.name, code: w.code })),
        productCount,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
