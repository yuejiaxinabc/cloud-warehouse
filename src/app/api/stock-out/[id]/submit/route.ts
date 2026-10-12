import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StockOutService } from '@/services/stock-out.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * POST /api/stock-out/[id]/submit - 提交审批（锁定库存）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    const operatorId = Number((session.user as any).id);

    const result = await StockOutService.submitForApproval(id, operatorId);
    return successResponse(result, '出库单已提交审批，库存已锁定');
  } catch (error) {
    return handleApiError(error);
  }
}
