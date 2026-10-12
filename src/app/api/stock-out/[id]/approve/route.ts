import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { StockOutService } from '@/services/stock-out.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { z } from 'zod';

const approveSchema = z.object({
  approved: z.boolean(),
  remark: z.string().max(500).optional(),
});

/**
 * POST /api/stock-out/[id]/approve - 审批出库单
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    const body = await request.json();
    const { approved, remark } = approveSchema.parse(body);

    const approverId = Number((session.user as any).id);
    const result = await StockOutService.approve(id, approved, approverId, remark);

    return successResponse(result, approved ? '审批通过' : '审批拒绝');
  } catch (error) {
    return handleApiError(error);
  }
}
