import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { TransferService } from '@/services/transfer.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
// v1.2.3 数据权限：调拨单详情做仓库守卫

/**
 * v1.2.3 数据权限：从鉴权结果解析当前用户的数据范围
 * API Token 调用没有角色/组织信息，roles 为空时 getDataScope 会落到最严的「仅本人经手」。
 */
async function resolveScope(auth: Awaited<ReturnType<typeof requireAuth>>): Promise<DataScope> {
  return getDataScope(auth.user);
}

/** v1.2.3 数据权限：返回体里的作用域摘要（warehouseCount = -1 表示不限仓库） */
function scopeSummary(scope: DataScope) {
  return {
    mode: scope.mode,
    label: scope.label,
    warehouseCount: scope.warehouseIds === null ? -1 : scope.warehouseIds.length,
  };
}

/**
 * GET /api/transfers/[id] - 调拨单详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('transfer:view', auth);

    // v1.2.3 数据权限：调拨单两头仓库任一在作用域内才放行（其余情况 403）
    const scope = await resolveScope(auth);
    const { id } = idSchema.parse({ id: params.id });
    console.log("[Transfer Detail] id:", id, "params:", JSON.stringify(params));
    let order;
    try {
      order = await TransferService.getById(id);
    } catch (e) {
      console.error("[Transfer Detail] getById error:", e);
      throw e;
    }
    await assertDocumentAllowed(scope, auth.user, order, { transfer: true });
    return successResponse({ ...order, scope: scopeSummary(scope) });
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
    const auth = await requireAuth(request);
    await requirePermission('transfer:create', auth);

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await TransferService.getById(id);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: true });
    const operatorId = Number(auth.user.id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined;

    const result = await TransferService.remove(id, operatorId, ip);
    return successResponse(result, '调拨单已删除');
  } catch (error) {
    return handleApiError(error);
  }
}
