import { prisma } from '@/lib/prisma';
import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
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
    const auth = await requireAuth(request);
    await requirePermission('transfer:create', auth);

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await prisma.transferOrder.findUnique({ where: { id } });
    if (!scopeOrder) return errorResponse('单据不存在', 404);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: true });
    const operatorId = Number(auth.user.id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

    const result = await TransferService.cancel(id, operatorId, ip);
    return successResponse(result, '调拨单已取消');
  } catch (error) {
    return handleApiError(error);
  }
}
