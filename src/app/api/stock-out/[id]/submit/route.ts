import { prisma } from '@/lib/prisma';
import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { StockOutService } from '@/services/stock-out.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * POST /api/stock-out/[id]/submit - 提交审批（锁定库存）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stock_out:create', auth);
    // v1.2.1：按权限闸门拦截（P0-1）

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) return errorResponse('单据不存在', 404);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: false });
    const operatorId = Number(auth.user.id);

    const result = await StockOutService.submitForApproval(id, operatorId);
    return successResponse(result, '出库单已提交审批，库存已锁定');
  } catch (error) {
    return handleApiError(error);
  }
}
