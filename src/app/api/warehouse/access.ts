import { requirePermission } from '@/lib/auth-guard';
import { getDataScope, assertWarehouseAllowed, withWarehouseScope } from '@/lib/data-scope';
import { prisma } from '@/lib/prisma';
import { AppError, ForbiddenError } from '@/lib/errors';

export async function businessAccess(permission: string | string[] = 'inventory:view') {
  const session = await requirePermission(permission);
  const su = session.user as any;
  const user = { id: Number(su.id), orgId: su.orgId ? Number(su.orgId) : null, roles: su.roles || [] };
  if (!user.roles.length) throw new ForbiddenError('权限不足：尚未分配业务角色');
  const scope = await getDataScope(user);
  return { session, user, scope };
}
export function warehouseWhere(scope: Awaited<ReturnType<typeof getDataScope>>) {
  return { deletedAt: null, ...(scope.warehouseIds !== null ? { id: { in: scope.warehouseIds } } : {}) };
}
export async function checkZone(scope: Awaited<ReturnType<typeof getDataScope>>, id: bigint | string | number) {
  const zone = await prisma.zone.findUnique({ where: { id: BigInt(id) } });
  if (!zone) throw new AppError('货区不存在', 404);
  await assertWarehouseAllowed(scope, Number(zone.warehouseId));
}
export async function checkLocation(scope: Awaited<ReturnType<typeof getDataScope>>, id: bigint | string | number) {
  const location = await prisma.location.findUnique({ where: { id: BigInt(id) }, include: { zone: true } });
  if (!location) throw new AppError('货位不存在', 404);
  await assertWarehouseAllowed(scope, Number(location.zone.warehouseId));
}
export { assertWarehouseAllowed, withWarehouseScope };
