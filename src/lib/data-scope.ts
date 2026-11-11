import { prisma } from './prisma';
import { ForbiddenError } from './errors';

export type DataScopeMode = 'ALL' | 'DEPT' | 'DEPT_AND_CHILD' | 'SELF' | 'CUSTOM';
export interface ScopeUser { id: number | string; orgId: number | string | null; roles: string[] }
export interface DataScope {
  mode: DataScopeMode;
  /** Inventory/create scope: SELF is restricted to the user's own organization; no org means deny. */
  warehouseIds: number[] | null;
  selfOnly: boolean;
  orgIds: number[];
  label: string;
  /** Document scope is a union of organizational grants and the SELF grant. */
  documentWarehouseIds?: number[] | null;
  includeSelf?: boolean;
}
const LABEL = { ALL: '全部数据', DEPT: '本部门', DEPT_AND_CHILD: '本部门及下级', CUSTOM: '指定组织（多角色并集）', SELF: '仅本人单据；库存限本组织' };
/** Compatibility API: no cross-request cache, so revocation applies on the next request. */
export function clearDataScopeCache(_userId?: number): void {}
export function normalizeAncestors(chain: string | null | undefined): string {
  const ids = String(chain || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids.length ? ',' + ids.join(',') + ',' : '';
}
const denied = (): DataScope => ({ mode: 'CUSTOM', warehouseIds: [], documentWarehouseIds: [], selfOnly: false, includeSelf: false, orgIds: [], label: '无数据权限' });
export async function getDataScope(user: ScopeUser): Promise<DataScope> {
  try {
    const codes = (user.roles || []).filter(Boolean);
    if (!codes.length || !Number(user.id)) return denied();
    // AuthResult.user already reflects current active roles; additionally load current scope configuration.
    const rows = await prisma.role.findMany({ where: { code: { in: codes }, status: 1 }, select: { code: true, dataScope: true, dataScopeOrgIds: true } });
    if (rows.some(r => r.code === 'admin' || (r.dataScope || 'ALL') === 'ALL')) {
      return { mode: 'ALL', warehouseIds: null, documentWarehouseIds: null, selfOnly: false, includeSelf: false, orgIds: [], label: LABEL.ALL };
    }
    const orgs = new Set<number>();
    const ownOrg = Number(user.orgId || 0);
    let includeSelf = false;
    for (const row of rows) {
      const mode = String(row.dataScope).toUpperCase();
      if (mode === 'SELF') includeSelf = true;
      if (mode === 'CUSTOM') for (const raw of String(row.dataScopeOrgIds || '').split(',')) {
        const id = Number(raw.trim()); if (Number.isSafeInteger(id) && id > 0) orgs.add(id);
      }
      if ((mode === 'DEPT' || mode === 'DEPT_AND_CHILD') && ownOrg) {
        orgs.add(ownOrg);
        if (mode === 'DEPT_AND_CHILD') {
          const children = await prisma.organization.findMany({ where: { ancestors: { contains: ',' + ownOrg + ',' } }, select: { id: true } });
          children.forEach(c => orgs.add(Number(c.id)));
        }
      }
    }
    const inventoryOrgs = new Set(orgs);
    if (includeSelf && ownOrg) inventoryOrgs.add(ownOrg);
    const warehouses = inventoryOrgs.size ? await prisma.warehouse.findMany({ where: { deletedAt: null, orgId: { in: [...inventoryOrgs] } }, select: { id: true, orgId: true } }) : [];
    const selfOnly = includeSelf && orgs.size === 0;
    return { mode: selfOnly ? 'SELF' : 'CUSTOM', warehouseIds: warehouses.map(w => Number(w.id)), documentWarehouseIds: warehouses.filter(w => orgs.has(Number(w.orgId))).map(w => Number(w.id)), includeSelf, selfOnly, orgIds: [...inventoryOrgs], label: selfOnly ? LABEL.SELF : LABEL.CUSTOM };
  } catch (error) {
    console.error('[data-scope] resolution failed; deny all', error);
    return denied();
  }
}
/** Always intersect; never replace an existing warehouse, OR, AND or relation predicate. */
export function withWarehouseScope<T extends Record<string, any>>(where: T, scope: DataScope, opts: { field?: 'warehouseId' | 'warehouse' } = {}): T {
  if (scope.warehouseIds === null) return { ...where };
  const ids = scope.warehouseIds;
  const guard = opts.field === 'warehouse' ? { warehouse: { id: { in: ids } } } : { warehouseId: { in: ids } };
  return { AND: [where, guard] } as unknown as T;
}
export function withDocumentScope<T extends Record<string, any>>(where: T, scope: DataScope, user: { id: number | string }, opts: { transfer?: boolean; field?: string } = {}): T {
  const ids = scope.documentWarehouseIds === undefined ? (scope.selfOnly ? [] : scope.warehouseIds) : scope.documentWarehouseIds;
  if (ids === null) return { ...where };
  const branches: Record<string, any>[] = opts.transfer ? [{ fromWhId: { in: ids } }, { toWhId: { in: ids } }] : [{ warehouseId: { in: ids } }];
  if ((scope.includeSelf ?? scope.selfOnly) && Number(user.id) > 0) branches.push({ [opts.field || 'operatorId']: Number(user.id) });
  return { AND: [where, { OR: branches }] } as unknown as T;
}
/** Legacy helper; document callers should use withDocumentScope, not compose warehouse/self filters. */
export function withSelfScope<T extends Record<string, any>>(where: T, scope: DataScope, user: { id: number | string }, field = 'operatorId'): T {
  return scope.selfOnly ? { AND: [where, { [field]: Number(user.id) }] } as unknown as T : where;
}
export function describeScope(scope: DataScope): string { return scope.label; }
export async function assertWarehouseAllowed(scope: DataScope, warehouseId: number | bigint | null | undefined): Promise<void> {
  if (scope.warehouseIds === null) return;
  if (!scope.warehouseIds.includes(Number(warehouseId))) throw new ForbiddenError('该仓库不在你的数据权限范围内');
}
export async function assertDocumentAllowed(scope: DataScope, user: { id: number | string }, order: { warehouseId?: number | bigint | null; fromWhId?: number | bigint; toWhId?: number | bigint; operatorId?: number | bigint | null }, opts: { transfer?: boolean } = {}): Promise<void> {
  const ids = scope.documentWarehouseIds === undefined ? (scope.selfOnly ? [] : scope.warehouseIds) : scope.documentWarehouseIds;
  if (ids === null) return;
  if ((scope.includeSelf ?? scope.selfOnly) && Number(user.id) > 0 && Number(order.operatorId) === Number(user.id)) return;
  const warehouses = opts.transfer ? [order.fromWhId, order.toWhId] : [order.warehouseId];
  if (warehouses.some(id => ids.includes(Number(id)))) return;
  throw new ForbiddenError('该单据不在你的数据权限范围内');
}

/** Service mutation boundary: callers must supply the authenticated actor, never a body-supplied id. */
export async function authorizeDataOperation(actorId: number | undefined, permission: string, target: { warehouseId?: number | bigint | null; fromWhId?: number | bigint; toWhId?: number | bigint; operatorId?: number | bigint | null }, options: { create?: boolean; transfer?: boolean } = {}): Promise<void> {
  const { loadAccountState } = await import('./account-state');
  const user = actorId ? await loadAccountState(actorId) : null;
  if (!user || !user.roles.length || !(user.permissions.includes('*') || user.permissions.includes(permission))) throw new ForbiddenError('缺少业务操作权限或有效操作人');
  const scope = await getDataScope(user);
  if (options.create) {
    if (options.transfer) {
      await assertWarehouseAllowed(scope, target.fromWhId);
      await assertWarehouseAllowed(scope, target.toWhId);
    } else await assertWarehouseAllowed(scope, target.warehouseId);
  } else await assertDocumentAllowed(scope, user, target, options);
}

