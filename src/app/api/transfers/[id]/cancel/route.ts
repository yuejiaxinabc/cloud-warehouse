import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TransferService } from '@/services/transfer.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * POST /api/transfers/[id]/cancel - 取消调拨单
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

    const result = await TransferService.cancel(id, operatorId, ip);
    return successResponse(result, '调拨单已取消');
  } catch (error) {
    return handleApiError(error);
  }
}
