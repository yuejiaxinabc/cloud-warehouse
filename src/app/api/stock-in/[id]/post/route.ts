import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StockInService } from '@/services/stock-in.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * POST /api/stock-in/[id]/post - 入库单过账
 * 核心操作：写流水 + 更新库存 + 更新批次 + 审计日志
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

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const result = await StockInService.post(id, operatorId, ip);
    return successResponse(result, '入库单过账成功');
  } catch (error) {
    return handleApiError(error);
  }
}
