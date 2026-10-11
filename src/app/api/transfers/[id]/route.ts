import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TransferService } from '@/services/transfer.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * GET /api/transfers/[id] - 调拨单详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: params.id });
    console.log("[Transfer Detail] id:", id, "params:", JSON.stringify(params));
    let order;
    try {
      order = await TransferService.getById(id);
    } catch (e) {
      console.error("[Transfer Detail] getById error:", e);
      throw e;
    }
    return successResponse(order);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/transfers/[id] - 删除调拨单
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: params.id });
    const operatorId = Number((session.user as any).id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

    const result = await TransferService.remove(id, operatorId, ip);
    return successResponse(result, '调拨单已删除');
  } catch (error) {
    return handleApiError(error);
  }
}
