import { prisma } from '@/lib/prisma';
import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { StockInService } from '@/services/stock-in.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { emitWebhook } from '@/lib/webhook';

/**
 * POST /api/stock-in/[id]/post - 入库单过账
 * 核心操作：写流水 + 更新库存 + 更新批次 + 审计日志
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stock_in:post', auth);
    // v1.2.1：按权限闸门拦截（P0-1）

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await prisma.inboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) return errorResponse('单据不存在', 404);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: false });
    const operatorId = Number(auth.user.id);

    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const result = await StockInService.post(id, operatorId, ip);

    // v1.2.0：入库过账推送 Webhook（异步，失败不阻塞）
    void emitWebhook('inbound.posted', {
      orderId: String(id),
      operatorId,
      result: typeof result === 'object' ? JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) : result,
    });

    return successResponse(result, '入库单过账成功');
  } catch (error) {
    return handleApiError(error);
  }
}
