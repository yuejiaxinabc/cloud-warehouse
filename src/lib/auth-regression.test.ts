/** Run: node -r ts-node/register/transpile-only src/lib/auth-regression.test.ts
 * TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}'
 * Stateful repository fakes exercise real callbacks/guards/route handlers. No DB/network.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import Module from 'node:module';

const nativeLoad = (Module as any)._load;
let account: any;
let currentSession: any;
let requestPath = '/api/settings/profile';
let apiRow: any;
let settings: any[] = [];
let logEntries: any[] = [];
let updates = 0;
const revoked = new Set<string>();
const db: any = {
  user: {
    findUnique: async () => account,
    findFirst: async () => account,
    update: async ({ data }: any) => {
      updates++;
      if (data.sessionVersion) account.sessionVersion += data.sessionVersion.increment;
      Object.assign(account, Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'sessionVersion')));
      return account;
    },
    updateMany: async ({ where, data }: any) => {
      if (!account || (where.twoFactorEnabled !== undefined && where.twoFactorEnabled !== account.twoFactorEnabled) || (where.verifyToken !== undefined && where.verifyToken !== account.verifyToken)) return { count: 0 };
      await db.user.update({ data }); return { count: 1 };
    },
  },
  role: { count: async ({ where }: any) => where.id.in.length },
  organization: { findFirst: async () => ({ id: BigInt(2), status: 1 }) },
  userRole: { deleteMany: async () => {}, createMany: async () => {} },
  operationLog: { create: async () => {} },
  loginLog: { create: async () => {} },
  systemConfig: {
    findMany: async () => settings,
    findFirst: async () => settings[0] || null,
    deleteMany: async ({ where }: any) => {
      const hit = settings.findIndex(r => r.colKey === where.colKey && r.value === where.value);
      if (hit < 0) return { count: 0 }; settings.splice(hit, 1); return { count: 1 };
    },
  },
  $queryRaw: async () => apiRow ? [apiRow] : [],
  $executeRaw: async () => 1,
  $transaction: async (fn: any) => typeof fn === 'function' ? fn(db) : Promise.all(fn),
};
(Module as any)._load = function(name: string, parent: any, isMain: boolean) {
  if (name === './prisma' || name === '@/lib/prisma') return { prisma: db };
  if (name === './session-revocation') return { newSessionId: () => 'new-sid', isSessionRevoked: async (sid: string) => revoked.has(sid), revokeSession: async (sid: string) => { revoked.add(sid); } };
  if (name === 'next-auth') return { getServerSession: async () => currentSession };
  if (name === 'next/headers') return { headers: () => new Headers({ 'x-cw-path': requestPath, 'x-cw-method': 'GET' }) };
  if (name === './rate-limit' || name === '@/lib/rate-limit') return { hit: async () => ({ allowed: true }), reset: async () => {}, clientIp: () => '127.0.0.1', lockKey: () => '', isLocked: async () => false };
  if (name === './captcha-store') return { consumeCaptcha: async () => true };
  if (name === './env-guard') return { secretUsable: () => true };
  if (name === './log' || name === '@/lib/log') return { writeLog: async (entry: any) => { logEntries.push(entry); }, getClientIp: () => '127.0.0.1' };
  if (name === '@/lib/data-scope') return { clearDataScopeCache: () => {} };
  if (name.startsWith('@/')) name = path.join(process.cwd(), 'src', name.slice(2));
  return nativeLoad.call(this, name, parent, isMain);
};
const { NextRequest } = require('next/server');
const { authOptions } = require('./auth');
const { permissionsForRoles, loadAccountState, validateSessionPrincipal } = require('./account-state');
const { getSessionChecked, requirePermission, requireAuth, readPermissionForPath } = require('./auth-guard');
const twofa = require('../app/api/auth/2fa/route');
const users = require('../app/api/users/route');
const reset = require('../app/api/auth/admin-reset/route');
const { validateApiToken } = require('./token-auth');
const { validateSystemToken } = require('./api-token');
const bcrypt = require('bcryptjs');
function role(code: string, permissions: string[] = [], configured = false, status = 1) {
  return { role: { code, status, permissionsConfigured: configured, rolePermissions: permissions.map(code => ({ permission: { code, status: 1 } })) } };
}
function resetAccount() {
  account = { id: BigInt(1), username: 'tester', realName: 'Test', email: null, orgId: BigInt(2), status: 1, sessionVersion: 0, userRoles: [role('auditor')], twoFactorEnabled: false };
  currentSession = null; updates = 0; logEntries = []; requestPath = '/api/settings/profile';
}
async function session() { currentSession = { user: { ...await loadAccountState('1'), sid: 'sid' } }; return currentSession; }
function req(url: string, body?: any, method = 'POST') { return new NextRequest('http://localhost' + url, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
let passed = 0;
async function test(name: string, run: () => Promise<void> | void) { resetAccount(); await run(); passed++; console.log('PASS ' + name); }
async function main() {
 await test('legacy token without version invalidates; fresh login records version', async () => {
   assert.equal(await validateSessionPrincipal({ sub: '1', sid: 'sid' }), null);
   const token = await authOptions.callbacks.jwt({ token: {}, user: { id: '1', sessionVersion: 0 } });
   assert.equal(token.sessionVersion, 0); assert.equal(token.sid, 'new-sid'); assert.equal(token.invalid, false);
 });
 await test('disable and reenable never revive old JWT', async () => {
   const token = { sub: '1', sessionVersion: 0, sid: 'sid' };
   assert.ok(await validateSessionPrincipal(token));
   account.status = 0; account.sessionVersion++;
   assert.equal(await validateSessionPrincipal(token), null);
   account.status = 1;
   assert.equal(await validateSessionPrincipal(token), null);
   assert.equal(await authOptions.callbacks.session({ session: { user: {} }, token }), null);
 });
 await test('current enabled role and permission changes override stale JWT grants', async () => {
   const token = { sub: '1', sessionVersion: 0, sid: 'sid', roles: ['admin'], permissions: ['*'] };
   account.userRoles = [];
   const refreshed = await authOptions.callbacks.jwt({ token });
   assert.deepEqual(refreshed.permissions, []); assert.deepEqual(refreshed.roles, []);
   account.userRoles = [role('admin', [], false, 0), role('custom', ['product:view'], true)];
   const current = await validateSessionPrincipal(token);
   assert.deepEqual(current.roles, ['custom']); assert.deepEqual(current.permissions, ['product:view']);
 });
 await test('fallback works per enabled role; explicit empty grants nothing', () => {
   assert.ok(permissionsForRoles([role('wh_keeper')]).permissions.includes('stock_in:create'));
   assert.deepEqual(permissionsForRoles([role('wh_keeper', [], true)]).permissions, []);
   assert.deepEqual(permissionsForRoles([]).permissions, []);
   assert.ok(permissionsForRoles([role('buyer'), role('custom', ['audit:view'], true)]).permissions.includes('purchase:create'));
 });
 await test('empty role can read profile and 2FA but business read gets 403', async () => {
   account.userRoles = []; await session(); assert.ok(await getSessionChecked());
   requestPath = '/api/products/5'; await assert.rejects(getSessionChecked, (e: any) => e.statusCode === 403);
   requestPath = '/api/auth/2fa'; assert.equal((await twofa.GET(req('/api/auth/2fa', undefined, 'GET'))).status, 200);
 });
 await test('provided stale session is rechecked by requirePermission', async () => {
   await session(); account.userRoles = [];
   await assert.rejects(() => requirePermission('product:view', currentSession), (e: any) => e.statusCode === 403);
 });
 await test('anonymous 2FA returns standard JSON 401 inside try', async () => {
   const result = await twofa.GET(req('/api/auth/2fa', undefined, 'GET'));
   assert.equal(result.status, 401); const body = await result.json(); assert.equal(body.success, false); assert.equal(body.code, 401);
 });
 await test('setup never replaces enabled TOTP secret', async () => {
   account.twoFactorEnabled = true; account.totpSecret = 'existing-secret'; await session();
   const result = await twofa.POST(req('/api/auth/2fa', { action: 'setup' }));
   assert.equal(result.status, 409); assert.equal(account.totpSecret, 'existing-secret'); assert.equal(updates, 0);
 });
 await test('body id update increments version and records actor', async () => {
   account.userRoles = [role('admin')]; await session();
   const result = await users.PUT(req('/api/users', { id: 1, status: 0, roleIds: [], orgId: null }, 'PUT'));
   assert.equal(result.status, 200); assert.equal(account.sessionVersion, 1); assert.equal(logEntries[0].userId, '1');
 });
 await test('conflicting query and body id rejected without update', async () => {
   account.userRoles = [role('admin')]; await session();
   const result = await users.PUT(req('/api/users?id=2', { id: 1, status: 0 }, 'PUT'));
   assert.equal(result.status, 400); assert.equal(updates, 0);
 });
 await test('API token checks current user, version and permission intersection', async () => {
   apiRow = { id: 1, user_id: 1, status: 1, permissions: JSON.stringify({ sessionVersion: 0, permissions: ['read'] }) };
   const request = new NextRequest('http://localhost/api/v1/products', { headers: { authorization: 'Bearer test' } });
   assert.equal((await validateApiToken(request)).valid, true);
   account.status = 0; assert.equal((await validateApiToken(request)).valid, false);
   account.status = 1; account.sessionVersion++; assert.equal((await validateApiToken(request)).valid, false);
   account.sessionVersion = 0; account.userRoles = []; await assert.rejects(() => validateApiToken(request), (e: any) => e.statusCode === 403);
 });
 await test('shared token requires bound current principal, never anonymous wildcard', async () => {
   settings = [{ colKey: 'api_token', value: 'fixture' }]; assert.equal(await validateSystemToken('fixture'), null);
   settings.push({ colKey: 'api_token_owner', value: JSON.stringify({ userId: '1', sessionVersion: 0 }) });
   assert.ok(await validateSystemToken('fixture')); account.sessionVersion++; assert.equal(await validateSystemToken('fixture'), null);
 });
 await test('reset token missing expiry fails closed', async () => {
   settings = [{ colKey: 'global', value: await bcrypt.hash('fixture-token', 4) }, { colKey: 'username', value: 'tester' }];
   const result = await reset.POST(req('/api/auth/admin-reset', { action: 'verify', username: 'tester', token: 'fixture-token', newPassword: 'new-password-123' }));
   assert.equal(result.status, 400); assert.equal(updates, 0);
 });
 await test('reset token atomic consumption allows exactly one redemption', async () => {
   settings = [{ colKey: 'global', value: await bcrypt.hash('fixture-token', 4) }, { colKey: 'username', value: 'tester' }, { colKey: 'expiresAt', value: new Date(Date.now() + 60000).toISOString() }];
   const body = { action: 'verify', username: 'tester', token: 'fixture-token', newPassword: 'new-password-123' };
   const results = await Promise.all([reset.POST(req('/api/auth/admin-reset', body)), reset.POST(req('/api/auth/admin-reset', body))]);
   assert.deepEqual(results.map(r => r.status).sort(), [200, 400]); assert.equal(updates, 1); assert.equal(account.sessionVersion, 1);
 });
 await test('list detail export route policies and AuthResult union stay compatible', async () => {
   assert.equal(readPermissionForPath('/api/products/1'), 'product:view'); assert.equal(readPermissionForPath('/api/products/export'), 'product:view');
   await session(); const auth = await requireAuth(req('/api/settings/profile', undefined, 'GET'));
   assert.equal(auth.type, 'session'); assert.equal(auth.user.id, '1'); assert.ok(auth.session);
   await requirePermission('product:view', auth);
 });
 console.log('AUTH REGRESSION: ' + passed + ' passed; stateful mocks, no production I/O');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { (Module as any)._load = nativeLoad; });
