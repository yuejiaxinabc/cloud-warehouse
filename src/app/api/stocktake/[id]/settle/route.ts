import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StocktakeService } from '@/services/stocktake.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * POST /api/stocktake/[id]/settle - 盘点结算
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: params.id });
    const operatorId = Number((session.user as any).id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

    const result = await StocktakeService.settle(id, operatorId, ip);
    return successResponse(result, '盘点结算完成');
  } catch (error) {
    return handleApiError(error);
  }
}
