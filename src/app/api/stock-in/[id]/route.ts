import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { handleApiError } from '@/lib/errors';
// v1.2.3 数据权限：入库单详情做仓库守卫

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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('stock_in:view', auth);
    // v1.2.3 数据权限：先取作用域
    const scope = await resolveScope(auth);
    const id = Number(params.id);
    const order = await prisma.inboundOrder.findUnique({
      where: { id },
      include: {
        warehouse: true,
        supplier: true,
        inboundItems: { include: { product: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: '入库单不存在' }, { status: 404 });
    }
    // v1.2.3 数据权限：单据仓库不在作用域内直接 403
    await assertDocumentAllowed(scope, auth.user, order);

    return NextResponse.json({ success: true, data: serializeBigInt({ ...order, scope: scopeSummary(scope) }) });
  } catch (error: any) {
    return handleApiError(error);
  }
}
