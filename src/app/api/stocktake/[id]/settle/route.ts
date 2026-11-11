import { prisma } from '@/lib/prisma';
import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
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
    const auth = await requireAuth(request);
    await requirePermission('stocktake:settle', auth);
    // v1.2.1：结算会直接改库存，必须过结算权限（P0-1）

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await prisma.countOrder.findUnique({ where: { id } });
    if (!scopeOrder) return errorResponse('单据不存在', 404);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: false });
    const operatorId = Number(auth.user.id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

    const result = await StocktakeService.settle(id, operatorId, ip);
    return successResponse(result, '盘点结算完成');
  } catch (error) {
    return handleApiError(error);
  }
}
