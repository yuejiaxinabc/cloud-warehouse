import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { NextResponse, NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError } from './errors';
// H3 修复：登出后旧 token 必须立刻失效
// Session revocation and current grants are enforced by account-state.

/**
 * 鉴权闸门（v1.2.1，修复 P0-1 / P1-8 / P2-10）
 *
 * v1.2.0 的问题：
 *  1) 只有 requireAdmin 一处角色判断，且抛裸 Error —— 非管理员反而拿到 500（A10）；
 *  2) 其余 100+ 接口只校验「是否登录」，任何账号都能读写任意业务数据；
 *  3) seed 只给 admin 挂了 role_permission，其他角色 session.permissions 恒为空，
 *     所以「只看 DB 权限位」等于把所有人放行。
 *
 * 这里补三层：
 *  A. requireRole / requirePermission：统一抛 AppError（401/403），交给 handleApiError 出参；
 *  B. 角色码 → 权限集兜底矩阵（DB 权限位为空时生效）；
 *  C. DB 权限位优先：某角色一旦在 DB 里配了权限，就以 DB 为准，可精细回收。
 */

import { loadAccountState, validateSessionPrincipal } from './account-state';
export { ROLE_PERMISSION_MATRIX, getEffectivePermissions } from './account-state';

/** 生效权限集是否包含所需权限（支持 '*' 全量） */
export function hasPermissionGranted(effectiveInput: unknown, required: string): boolean {
  const effective = Array.isArray(effectiveInput) ? effectiveInput.map(String) : [];
  return effective.includes('*') || effective.includes(required);
}

/**
 * 检查当前会话是否为管理员，返回 session 或抛错
 * 管理员 = roles 数组中包含 'admin'
 */
/**
 * 会话是否已被服务端吊销（H3）
 * 登出只清 Cookie 时旧 token 仍可用满整个有效期，这里按 sid 查吊销表。
 */
async function assertSessionActive(session: any) {
  const user = session?.user;
  const current = await validateSessionPrincipal({ sub: user?.id, sessionVersion: user?.sessionVersion, sid: user?.sid });
  if (!current) throw new UnauthorizedError('会话已失效，请重新登录');
  session.user = { ...current, sid: user.sid };
}

/** Route read policy. Nested detail/list/export paths share their resource permission. */
export function readPermissionForPath(path: string): string | null {
  path = path.replace(/[/]+$/, '');
  if (!path.startsWith('/api/')) return null;
  if (['/api/settings/profile', '/api/settings/password', '/api/users/change-password', '/api/auth/session', '/api/auth/2fa', '/api/tokens'].includes(path)) return null;
  const resource = path.slice(5).split('/')[0];
  const map: Record<string, string> = {
    products: 'product:view', inventory: 'inventory:view', 'location-stocks': 'inventory:view',
    'stock-in': 'stock_in:view', 'stock-out': 'stock_out:view', stocktake: 'stocktake:view', transfers: 'transfer:view',
    reports: 'report:view', export: 'report:export', snapshots: 'report:view', 'cost-snapshots': 'report:view',
    alerts: 'alert:view', bom: 'bom:view', customers: 'customer:view', suppliers: 'supplier:view',
    'purchase-requests': 'purchase:view', replenishment: 'purchase:view', warehouse: 'inventory:view', 'shelf-map': 'inventory:view',
    serial: 'inventory:view', labels: 'product:view', logs: 'audit:view', 'audit-logs': 'audit:view',
    'operation-logs': 'audit:view', 'login-logs': 'audit:view', users: 'user:manage', roles: 'role:manage',
    organizations: 'org:manage', dicts: 'product:view', attachments: 'product:view',
    webhooks: 'system:config', trash: 'system:config', recovery: 'system:config', settings: 'system:config',
  };
  return map[resource] || 'system:config';
}

export async function assertRequestReadPermission(user: { permissions?: unknown }, req?: NextRequest) {
  let path: string; let method: string;
  if (req) { path = new URL(req.url).pathname; method = req.method; }
  else {
    const { headers } = await import('next/headers');
    const h = headers();
    path = h.get('x-cw-path') || ''; method = h.get('x-cw-method') || '';
  }
  const required = readPermissionForPath(path);
  // A role-less account may manage its own profile/session/2FA but no business operation.
  const grants = Array.isArray(user.permissions) ? user.permissions : [];
  if (required && !grants.length) throw new ForbiddenError('权限不足：未分配业务权限');
  if (!['GET', 'HEAD'].includes(method)) return;
  if (required && !hasPermissionGranted(user.permissions, required)) throw new ForbiddenError('权限不足：需要 ' + required + ' 权限');
}

export async function getSessionChecked(req?: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  await assertSessionActive(session);
  await assertRequestReadPermission(session.user as any, req);
  return session;
}

export async function requireAdmin() {
  // 复用 requireLogin：401 用 AppError 子类抛出（否则会被 handleApiError 兜底成 500）
  const session = await requireLogin();
  const roles = (session.user as any)?.roles || [];
  if (!roles.includes('admin')) {
    throw new ForbiddenError('权限不足，仅管理员可操作');
  }
  return session;
}

/**
 * 检查当前会话是否已登录，返回 session 或抛错
 */
export async function requireLogin() {
  const session = await getSessionChecked();
  if (!session) {
    throw new UnauthorizedError('请先登录');
  }
  return session;
}

/**
 * 按权限码鉴权（v1.2.1 新增）
 *
 * 传数组表示「满足其中之一即可」。DB 权限位优先，DB 为空时回退角色矩阵，
 * 因此 seed 未给非 admin 挂权限位也能正确拦截只读角色。
 */
export async function requirePermission(perm: string | string[], session?: any) {
  const input = session ?? (await requireLogin());
  const current = input.type === 'session' ? input.session : input;
  if (input.type === 'token') {
    const principal = await loadAccountState(input.userId);
    if (!principal) throw new UnauthorizedError('账号已停用');
    current.user = principal;
  } else await assertSessionActive(current);
  const user = (current.user as any) || {};
  const effective = user.permissions;
  const required = (Array.isArray(perm) ? perm : [perm]).map(String);

  const withinToken = (code: string) => input.type !== 'token' || (Array.isArray(input.tokenPermissions) && (input.tokenPermissions.includes('*') || input.tokenPermissions.includes(code) || (code.endsWith(':view') && input.tokenPermissions.includes('read'))));
  if (!required.some((code) => hasPermissionGranted(effective, code) && withinToken(code))) {
    // 文案保留「权限不足」前缀：前端与既有测试按该关键字展示/断言
    throw new ForbiddenError(`权限不足：需要 ${required.join(' 或 ')} 权限`);
  }
  return current;
}

/**
 * 按角色码鉴权（v1.2.1 新增）
 * admin 恒放行；其余命中任一角色码即放行，否则 403。
 */
export async function requireRole(...codes: string[]) {
  const session = await requireLogin();
  const roles: string[] = (((session.user as any)?.roles) || []).map((r: unknown) => String(r).toLowerCase());

  if (roles.includes('admin')) return session;

  const allowed = codes.map((c) => String(c).toLowerCase());
  if (allowed.length === 0 || !roles.some((r) => allowed.includes(r))) {
    throw new ForbiddenError(`权限不足：需要 ${codes.join('/')} 角色`);
  }
  return session;
}

/** requireRole 的数组写法别名（便于按清单逐个路由挂载） */
export async function requireRoles(allowed: string[]) {
  return requireRole(...allowed);
}

/**
 * API 权限校验失败时的统一响应
 */
export function authErrorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : '未知错误';
  const status = msg.includes('权限不足') ? 403 : 401;
  return NextResponse.json(
    { success: false, error: msg },
    { status }
  );
}

/**
 * 统一认证检查：先查 session，再查 API Token
 * 用于所有需要认证的 API 路由
 */
export type AuthResult = Awaited<ReturnType<typeof requireAuth>>;

export async function requireAuth(req?: NextRequest) {
  // H3：getSessionChecked 内部已按 sid 校验吊销表
  const session = await getSessionChecked(req);
  if (session) {
    return { type: 'session' as const, session, user: session.user as unknown as NonNullable<Awaited<ReturnType<typeof loadAccountState>>> };
  }

  // 尝试 API Token 认证
  if (req) {
    const { validateApiToken } = await import('./token-auth');
    try {
      const auth = await validateApiToken(req);
      if (auth.valid && auth.userId) {
        const principal = await loadAccountState(auth.userId);
        if (!principal) throw new UnauthorizedError('账号已停用');
        await assertRequestReadPermission(principal, req);
        return { type: 'token' as const, userId: auth.userId, user: principal, tokenPermissions: auth.permissions || [] };
      }
    } catch (error) {
      // api_tokens 表缺失（P2021/P2010-1146）时不应把整条请求打成 500，
      // 按「Token 不可用」处理，由调用方返回 401/503。
      if (error instanceof ForbiddenError || error instanceof UnauthorizedError) throw error;
      console.error('[auth] validateApiToken failed:', error);
    }
  }

  throw new UnauthorizedError('请先登录');
}

/**
 * 开放接口（/api/v1/open/*）统一入口守卫（v1.2.1，修复 P1-4）
 *
 * v1.2.0 的写法是 `const auth = await requireOpenApi(req)` 放在 try 之外：
 *  - 未授权直接 return 401，但一旦 api_tokens 表缺失，$queryRaw 在 try 外抛错 →
 *    500 且响应体为空，调用方 JSON.parse 直接炸；
 *  - 现在统一收口：未授权 401 JSON，表缺失 503「开放接口未就绪」。
 */
export async function requireOpenApiAccess(req: NextRequest) {
  const { requireOpenApi } = await import('./open-api-auth');
  try {
    const auth = await requireOpenApi(req);
    if (!auth.ok) {
      return {
        ok: false as const,
        status: 401,
        body: { success: false, error: auth.error || 'Token 无效' },
      };
    }
    return { ok: true as const };
  } catch (error) {
    if (isTableMissingError(error)) {
      console.error('[open-api] api_tokens 表缺失，开放接口降级为 503：', error);
      return {
        ok: false as const,
        status: 503,
        body: { success: false, error: '开放接口未就绪：缺少 api_tokens 表，请联系管理员执行 prisma db push' },
      };
    }
    throw error;
  }
}

/**
 * 是否「表/列不存在」类错误
 *
 * v1.2.0 的 api_tokens 只在裸 SQL 里出现、schema 没有对应模型（P1-4/P2-11），
 * 打过去会抛 Prisma P2021/P2022，裸 SQL 则是 P2010 + MySQL 1146。
 * 统一识别，让开放接口能返回可读的 503 而不是空包 500。
 */
export function isTableMissingError(error: unknown): boolean {
  const err = error as any;
  const code = String(err?.code || '');
  const message = String(err?.message || '');

  if (code === 'P2021' || code === 'P2022') return true;
  if (code === 'P2010' && /1146|doesn'?t exist|does not exist/i.test(message)) return true;
  return /Table .*(doesn'?t|does not) exist|Unknown table|no such table/i.test(message);
}
