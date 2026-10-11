import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TransferService } from '@/services/transfer.service';
import { createTransferSchema, paginationSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * GET /api/transfers - 调拨单列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { searchParams } = new URL(request.url);
    const pagination = paginationSchema.parse({
      page: searchParams.get('page') || '1',
      pageSize: searchParams.get('pageSize') || '20',
    });

    const result = await TransferService.list({
      ...pagination,
      status: searchParams.get('status') || undefined,
      fromWhId: searchParams.get('fromWhId') ? Number(searchParams.get('fromWhId')) : undefined,
      toWhId: searchParams.get('toWhId') ? Number(searchParams.get('toWhId')) : undefined,
      keyword: searchParams.get('keyword') || undefined,
    });

    return successResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/transfers - 创建调拨单
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const body = await request.json();
    const validated = createTransferSchema.parse(body);

    const order = await TransferService.create({
      ...validated,
      operatorId: Number((session.user as any).id),
    });

    return successResponse(order, '调拨单创建成功');
  } catch (error) {
    return handleApiError(error);
  }
}
