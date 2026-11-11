import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { handleApiError } from '@/lib/errors';
// v1.2.3 数据权限：批次台账按角色数据范围收敛仓库

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
 * GET /api/inventory/lots
 *
 * v1.2 批次台账：把批次号 + 生产日期 + 到期日期当一等公民暴露出来，
 * 供「批次与效期」页和临期预警使用。
 *
 * 参数：warehouseId / productId / keyword / expiringDays / onlyExpired / page / pageSize
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    await requirePermission('inventory:view', auth);
    // v1.2.3 数据权限：先取作用域，再拼查询条件
    const scope = await resolveScope(auth);
    const sp = req.nextUrl.searchParams;
    const warehouseId = sp.get('warehouseId');
    const productId = sp.get('productId');
    const keyword = (sp.get('keyword') || '').trim();
    const expiringDays = parseInt(sp.get('expiringDays') || '0', 10);
    const onlyExpired = sp.get('onlyExpired') === '1';
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') || '20', 10)));

    const where: any = {};
    if (warehouseId) where.warehouseId = BigInt(warehouseId);
    if (productId) where.productId = BigInt(productId);
    if (keyword) {
      where.OR = [
        { lotNumber: { contains: keyword } },
        { product: { code: { contains: keyword } } },
        { product: { name: { contains: keyword } } },
      ];
    }

    const now = new Date();
    if (onlyExpired) {
      where.expiredAt = { not: null, lt: now };
    } else if (expiringDays > 0) {
      const until = new Date(now.getTime() + expiringDays * 24 * 3600 * 1000);
      where.expiredAt = { not: null, lte: until };
    }

    // v1.2.3 数据权限：仓库范围收敛（本表 warehouseId 为 BigInt，条件统一转 BigInt）；
    // 请求带 warehouseId 时与之取交集，避免越权或筛选被放大
    const scopedWhere: any = withWarehouseScope(where, scope);
    if (scopedWhere.warehouseId && Array.isArray(scopedWhere.warehouseId.in)) {
      scopedWhere.warehouseId = { in: scopedWhere.warehouseId.in.map((id: number) => BigInt(id)) };
    }
    if (warehouseId && scope.warehouseIds !== null) {
      const reqWhId = Number(warehouseId);
      scopedWhere.warehouseId = { in: scope.warehouseIds.includes(reqWhId) ? [BigInt(reqWhId)] : [BigInt(-1)] };
    }

    const [items, total] = await Promise.all([
      prisma.inventoryLot.findMany({
        where: scopedWhere,
        include: {
          product: { select: { id: true, code: true, name: true, shelfLifeDays: true, unit: { select: { name: true } } } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: [{ expiredAt: 'asc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // v1.2.3 数据权限：count 与 findMany 必须同一个 where，否则 total 会泄露总条数
      prisma.inventoryLot.count({ where: scopedWhere }),
    ]);

    const rows = items.map((lot: any) => {
      const daysLeft = lot.expiredAt
        ? Math.ceil((new Date(lot.expiredAt).getTime() - now.getTime()) / 86400000)
        : null;
      return {
        ...lot,
        daysLeft,
        // 1-正常 2-临近 3-已过期（临期阈值默认 30 天）
        expiryState: lot.expiredAt == null ? 'none' : daysLeft! < 0 ? 'expired' : daysLeft! <= 30 ? 'soon' : 'ok',
        // 2 = 冻结
        frozen: lot.status === 2,
      };
    });

    return NextResponse.json(serializeBigInt({ success: true, data: { items: rows, total, page, pageSize, scope: scopeSummary(scope) } }));
  } catch (error: any) {
    return handleApiError(error);
  }
}
