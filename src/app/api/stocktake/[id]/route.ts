import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { StocktakeService } from '@/services/stocktake.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
// v1.2.3 数据权限：盘点单详情做仓库守卫
import { z } from 'zod';

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
 * GET /api/stocktake/[id] - 盘点单详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stocktake:view', auth);

    // v1.2.3 数据权限：详情必须落在本人可见的仓库内，否则 403
    const scope = await resolveScope(auth);
    const { id } = idSchema.parse({ id: params.id });
    const order = await StocktakeService.getById(id);
    await assertDocumentAllowed(scope, auth.user, order);

    return successResponse({ ...order, scope: scopeSummary(scope) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/stocktake/[id] - 录入实盘数量 / 开始盘点
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stocktake:create', auth);
    // v1.2.1：盘点录入（start / 实盘数据）按权限闸门拦截（P0-1）

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await StocktakeService.getById(id);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: false });
    const body = await request.json();

    // 开始盘点
    if (body.action === 'start') {
      await StocktakeService.start(id, Number(auth.user.id));
      return successResponse(null, '盘点已开始');
    }

    // 录入实盘
    const entries = z.array(z.object({
      id: z.number().int().positive(),
      countQty: z.number().min(0),
      remark: z.string().max(500).optional(),
    })).parse(body.items);

    await StocktakeService.enterCount(id, entries, Number(auth.user.id));
    return successResponse(null, '实盘数据已录入');
  } catch (error) {
    return handleApiError(error);
  }
}
