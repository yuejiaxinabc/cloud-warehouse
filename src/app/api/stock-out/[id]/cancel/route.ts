import { prisma } from '@/lib/prisma';
import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { StockOutService } from '@/services/stock-out.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * POST /api/stock-out/[id]/cancel - 取消出库单（v1.2.1 新增）
 *
 * 为什么需要它：出库单 submit 后库存被 locked 占用，v1.2.0 既没有审批出口（approve 必 500）
 * 也没有取消接口，LOCKED 单据会把库存永久锁死。此接口是唯一合法的解锁出口。
 * 权限：具备 stock_out:approve 或管理员角色；未登录 401。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stock_out:approve', auth);
    // v1.2.1：按权限闸门拦截（P0-1）

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) return errorResponse('单据不存在', 404);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: false });
    const body = await request.json().catch(() => ({} as any));
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;
    const operatorId = Number(auth.user.id);

    const beforeStatus = String((scopeOrder as any).status || '');
    const result = await StockOutService.cancel(id, operatorId, reason);

    // P1-3：原来不论什么状态都提示「锁定库存已释放」，但 DRAFT 单本来就没锁库存（创建不占用量），
    // 这句提示是假的。按真实状态给不同文案，用户才知道到底动了什么。
    //   DRAFT            → 单据已取消，库存未变动
    //   LOCKED/APPROVED  → 已释放锁定（真实释放了 locked）
    //   其它（已被并发改过）→ 交给 service 的返回值说话
    let message = '出库单已取消';
    if (beforeStatus === 'DRAFT') {
      message = '出库单已取消（草稿单未占用库存，库存未变动）';
    } else if (beforeStatus === 'LOCKED' || beforeStatus === 'APPROVED') {
      message = '出库单已取消，已释放此前锁定的库存';
    }
    return successResponse(result, message);
  } catch (error) {
    return handleApiError(error);
  }
}