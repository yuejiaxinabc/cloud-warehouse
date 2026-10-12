import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BomService } from '@/services/bom.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * GET /api/bom/[id] - BOM 详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    const bom = await BomService.getById(id);

    return successResponse(bom);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/bom/[id] - 更新 BOM
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

    const bom = await BomService.update(id, body);
    return successResponse(bom, 'BOM 更新成功');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/bom/[id] - 删除 BOM
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    await BomService.delete(id);

    return successResponse(null, 'BOM 已删除');
  } catch (error) {
    return handleApiError(error);
  }
}
