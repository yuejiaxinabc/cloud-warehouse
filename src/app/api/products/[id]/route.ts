import { NextRequest } from 'next/server';
import { requirePermission, getSessionChecked } from '@/lib/auth-guard';
import { authOptions } from '@/lib/auth';
import { ProductService } from '@/services/product.service';
import { updateProductSchema, idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * GET /api/products/[id] - 商品详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionChecked();
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: params.id });
    await requirePermission('product:view');
    const product = await ProductService.getById(id);

    return successResponse(product);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/products/[id] - 更新商品
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionChecked();
    if (!session) return errorResponse('请先登录', 401);
    // v1.2.1：商品主数据修改需 product:edit（auditor 等只读角色不得改）
    await requirePermission('product:edit');

    const { id } = idSchema.parse({ id: params.id });
    const body = await request.json();
    const validated = updateProductSchema.parse(body);

    const product = await ProductService.update(id, validated);
    return successResponse(product, '商品更新成功');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/products/[id] - 删除商品（软删除）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionChecked();
    if (!session) return errorResponse('请先登录', 401);
    // v1.2.1：删除商品需 product:delete（默认只有 admin 具备）
    await requirePermission('product:delete');

    const { id } = idSchema.parse({ id: params.id });
    const product = await ProductService.delete(id);

    return successResponse(product, '商品已禁用');
  } catch (error) {
    return handleApiError(error);
  }
}
