import { prisma } from './prisma';
import { isSessionRevoked } from './session-revocation';
import { ForbiddenError } from './errors';

/** 只读类权限：所有业务角色共有的查看面 */
const READ_ONLY_PERMISSIONS = [
  'product:view',
  'inventory:view',
  'stock_in:view',
  'stock_out:view',
  'stocktake:view',
  'transfer:view',
  'report:view',
  'alert:view',
  'bom:view',
  'customer:view',
  'supplier:view',
];

/**
 * 角色码 → 权限集兜底矩阵
 * 权限码沿用 prisma/seed.ts 的既有命名（product:view、stock_out:post…），
 * 另外补充 v1.2.1 新覆盖的写面：customer:write/delete、supplier:write/delete。
 * '*' 表示全量。
 */
export const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  // 系统管理员：全部
  admin: ['*'],
  // 仓库主管：仓储读写 + 客户/供应商维护 + 日志查看
  wh_manager: [
    ...READ_ONLY_PERMISSIONS,
    'product:create',
    'product:edit',
    'stock_in:create',
    'stock_in:post',
    'stock_out:create',
    'stock_out:approve',
    'stock_out:post',
    'stocktake:create',
    'stocktake:settle',
    'transfer:create',
    'transfer:approve',
    'alert:manage',
    'report:export',
    'customer:write',
    'customer:delete',
    'supplier:write',
    'supplier:delete',
    'audit:view',
  ],
  // 仓管员：出入库与盘点执行（不含主数据维护、不含日志）
  wh_keeper: [
    ...READ_ONLY_PERMISSIONS,
    'stock_in:create',
    'stock_in:post',
    'stock_out:create',
    'stocktake:create',
  ],
  // 采购员：供应商维护 + 采购申请
  buyer: [
    ...READ_ONLY_PERMISSIONS,
    'supplier:write',
    'purchase:view',
    'purchase:create',
  ],
  // 销售员：客户维护 + 出库申请
  sales: [...READ_ONLY_PERMISSIONS, 'customer:write', 'stock_out:create'],
  // 审计员：只读（含审计日志），任何写操作一律拒绝
  auditor: [...READ_ONLY_PERMISSIONS, 'audit:view'],
};


/** Compatibility helper. Runtime authorization uses permissionsForRoles, not JWT fallback. */
export function getEffectivePermissions(rolesInput: unknown, dbPermissionsInput: unknown): string[] {
  const roles = Array.isArray(rolesInput) ? rolesInput.map(r => String(r).toLowerCase()) : [];
  const configured = Array.isArray(dbPermissionsInput) ? dbPermissionsInput.map(String) : [];
  if (!roles.length) return [];
  const result = new Set(configured.length ? configured : roles.flatMap(r => ROLE_PERMISSION_MATRIX[r] || []));
  if (roles.includes('admin')) result.add('*');
  return [...result];
}

/** Per-role fallback only for never-configured roles; explicit [] grants nothing.
 * Enabled built-in admin is the documented break-glass role. Disabled roles grant nothing. */
export function permissionsForRoles(userRoles: any[]) {
  const roles: string[] = [];
  const permissions = new Set<string>();
  for (const { role } of userRoles) {
    if (role.status !== 1) continue;
    const code = String(role.code).toLowerCase();
    roles.push(code);
    const configured = role.rolePermissions.filter((rp: any) => rp.permission.status === 1).map((rp: any) => rp.permission.code);
    const grants = role.rolePermissions.length || role.permissionsConfigured ? configured : (ROLE_PERMISSION_MATRIX[code] || []);
    for (const permission of grants) permissions.add(permission);
    if (code === 'admin') permissions.add('*');
  }
  return { roles, permissions: [...permissions] };
}

export async function loadAccountState(id: unknown) {
  if (!/^[1-9][0-9]*$/.test(String(id ?? ''))) return null;
  const user = await prisma.user.findUnique({
    where: { id: BigInt(String(id)) },
    include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
  });
  if (!user || user.status !== 1) return null;
  return {
    id: user.id.toString(), name: user.realName, email: user.email, username: user.username,
    orgId: user.orgId?.toString() ?? null, sessionVersion: user.sessionVersion,
    ...permissionsForRoles(user.userRoles),
  };
}

/** API tokens are read-only unless a route explicitly grants a write permission. */
export function tokenReadPermission(path: string): string {
  const parts = path.split('/').filter(Boolean);
  const resource = parts[1] === 'v1' ? (['open', 'mp'].includes(parts[2]) ? parts[3] : parts[2]) : parts[1];
  const map: Record<string, string> = { products: 'product:view', inventory: 'inventory:view', movements: 'inventory:view', dashboard: 'inventory:view', warehouses: 'inventory:view', box: 'inventory:view', boxes: 'inventory:view', locations: 'inventory:view', purchase: 'purchase:view', 'stock-in': 'stock_in:view', 'stock-out': 'stock_out:view', stocktake: 'stocktake:view' };
  return map[resource] || 'system:config';
}
export function assertTokenPermission(principal: { permissions: string[] }, path: string, method: string, grants?: string[]) {
  if (path === '/api/v1/mp/me') return;
  const required = tokenReadPermission(path);
  const read = ['GET', 'HEAD'].includes(method);
  const write: Record<string, string> = { 'stock_in:view': 'stock_in:create', 'stock_out:view': 'stock_out:create', 'stocktake:view': 'stocktake:create', 'purchase:view': 'purchase:create' };
  const permission = read ? required : write[required];
  const ownerAllowed = permission && (principal.permissions.includes('*') || principal.permissions.includes(permission));
  const tokenAllowed = !grants || grants.includes('*') || grants.includes(permission) || (read && grants.includes('read'));
  if (!ownerAllowed || !tokenAllowed) throw new ForbiddenError('权限不足：需要 ' + (permission || '专用写入') + ' 权限');
}

export async function validateSessionPrincipal(token: { sub?: unknown; sessionVersion?: unknown; sid?: unknown }) {
  if (!Number.isInteger(token.sessionVersion) || Number(token.sessionVersion) < 0 || typeof token.sid !== 'string' || !token.sid) return null;
  const current = await loadAccountState(token.sub);
  if (!current || current.sessionVersion !== token.sessionVersion || await isSessionRevoked(token.sid)) return null;
  return current;
}
