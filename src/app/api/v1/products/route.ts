import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { validateApiToken, hasPermission } from '@/lib/token-auth';

// GET /api/v1/products - 获取商品列表（需要 Token）
export async function GET(req: NextRequest) {
  try {
    // 验证 Token
    const auth = await validateApiToken(req);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const where: any = {};
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { code: { contains: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { 
          category: true, 
          inventories: { include: { warehouse: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);

    const itemsWithStock = items.map((item: any) => {
      const totalStock = item.inventories.reduce(
        (sum: number, inv: any) => sum + Number(inv.onHand || 0), 
        0
      );
      return { ...item, totalStock };
    });

    return NextResponse.json({ 
      success: true, 
      data: serializeBigInt({ items: itemsWithStock, total, page, pageSize }) 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
