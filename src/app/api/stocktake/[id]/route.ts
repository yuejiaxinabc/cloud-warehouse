import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StocktakeService } from '@/services/stocktake.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { z } from 'zod';

/**
 * GET /api/stocktake/[id] - 盘点单详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    const order = await StocktakeService.getById(id);

    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/stocktake/[id] - 录入实盘数量 / 开始盘点
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    const body = await request.json();

    // 开始盘点
    if (body.action === 'start') {
      await StocktakeService.start(id);
      return successResponse(null, '盘点已开始');
    }

    // 录入实盘
    const entries = z.array(z.object({
      id: z.number().int().positive(),
      countQty: z.number().min(0),
      remark: z.string().max(500).optional(),
    })).parse(body.items);

    await StocktakeService.enterCount(id, entries);
    return successResponse(null, '实盘数据已录入');
  } catch (error) {
    return handleApiError(error);
  }
}
