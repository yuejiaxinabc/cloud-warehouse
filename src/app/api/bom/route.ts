import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BomService } from '@/services/bom.service';
import { createBomSchema, paginationSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-guard';

/**
 * GET /api/bom - BOM 列表
 */
export async function GET(request: NextRequest) {
    await requireAuth(request);
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // 齐套校验
    if (action === 'kit-check') {
      const bomId = Number(searchParams.get('bomId'));
      const quantity = Number(searchParams.get('quantity') || '1');
      if (!bomId) return errorResponse('BOM ID不能为空');

      const result = await BomService.kitCheck(bomId, quantity);
      return successResponse(result);
    }

    // 标准成本
    if (action === 'standard-cost') {
      const bomId = Number(searchParams.get('bomId'));
      if (!bomId) return errorResponse('BOM ID不能为空');

      const result = await BomService.calcStandardCost(bomId);
      return successResponse(result);
    }

    // 默认：BOM 列表
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '20',
    });

    const result = await BomService.list({
      ...pagination,
      keyword: searchParams.get('keyword') || undefined,
      productId: searchParams.get('productId') ? Number(searchParams.get('productId')) : undefined,
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/bom - 创建 BOM
 */
export async function POST(request: NextRequest) {
    await requireAuth(request);
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const body = await request.json();
    const validated = createBomSchema.parse(body);

    const bom = await BomService.create(validated);
    return successResponse(bom, 'BOM 创建成功');
  } catch (error) {
    return handleApiError(error);
  }
}
