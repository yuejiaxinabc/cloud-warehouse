/** Offline regression suite: no Prisma connection, HTTP requests, or production data. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = process.cwd();
let roles: any[] = [];
let failRoles = false;
let principal: any = null;
const warehouses = [{ id: 11, orgId: 1 }, { id: 22, orgId: 2 }, { id: 33, orgId: 3 }];
const prisma = {
  role: { findMany: async ({ where }: any) => { if (failRoles) throw Error('offline failure'); return roles.filter(r => where.code.in.includes(r.code) && r.status === 1); } },
  organization: { findMany: async () => [{ id: 2 }] },
  warehouse: { findMany: async ({ where }: any) => warehouses.filter(w => where.orgId.in.includes(w.orgId)) },
};
class ForbiddenError extends Error { statusCode = 403; }
const mod = { exports: {} as any };
const source = readFileSync(path.join(root, 'src/lib/data-scope.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
  exports: mod.exports, module: mod, console: { error() {} },
  require: (name: string) => {
    if (name === './prisma') return { prisma };
    if (name === './errors') return { ForbiddenError };
    if (name === './account-state') return { loadAccountState: async () => principal };
    throw Error('Unexpected dependency: ' + name);
  },
});
const { getDataScope, withWarehouseScope, withDocumentScope, assertDocumentAllowed, assertWarehouseAllowed, authorizeDataOperation } = mod.exports;
const user = { id: 7, orgId: 1, roles: ['a', 'b'] };
const role = (code: string, dataScope: string, dataScopeOrgIds = '') => ({ code, dataScope, dataScopeOrgIds, status: 1 });
const plain = (value: any) => JSON.parse(JSON.stringify(value));
let passed = 0;
async function check(name: string, run: () => any) { await run(); passed++; console.log('PASS ' + name); }
async function main() {
  await check('empty roles deny, including own documents', async () => {
    const s = await getDataScope({ ...user, roles: [] }); assert.deepEqual(plain(s.warehouseIds), []);
    await assert.rejects(assertDocumentAllowed(s, user, { warehouseId: 11, operatorId: 7 }));
  });
  await check('non-admin ALL and legacy unset remain unrestricted', async () => {
    for (const value of ['ALL', '']) { roles = [role('a', value)]; const s = await getDataScope(user); assert.equal(s.warehouseIds, null); assert.equal(s.documentWarehouseIds, null); }
  });
  await check('CUSTOM role union', async () => { roles = [role('a', 'CUSTOM', '1'), role('b', 'CUSTOM', '3')]; assert.deepEqual(plain((await getDataScope(user)).warehouseIds), [11, 33]); });
  await check('DEPT_AND_CHILD union CUSTOM', async () => { roles = [role('a', 'DEPT_AND_CHILD'), role('b', 'CUSTOM', '3')]; assert.deepEqual(plain((await getDataScope(user)).warehouseIds), [11, 22, 33]); });
  await check('SELF inventory own organization only', async () => { roles = [role('a', 'SELF')]; const s = await getDataScope(user); assert.deepEqual(plain(s.warehouseIds), [11]); await assert.rejects(assertWarehouseAllowed(s, 22)); });
  await check('SELF without organization inventory denied', async () => { roles = [role('a', 'SELF')]; assert.deepEqual(plain((await getDataScope({ ...user, orgId: null })).warehouseIds), []); });
  await check('SELF own document allowed across warehouses, others denied', async () => { roles = [role('a', 'SELF')]; const s = await getDataScope(user); await assertDocumentAllowed(s, user, { warehouseId: 22, operatorId: 7 }); await assert.rejects(assertDocumentAllowed(s, user, { warehouseId: 11, operatorId: 8 })); });
  await check('mixed SELF and CUSTOM uses document union', async () => { roles = [role('a', 'SELF'), role('b', 'CUSTOM', '3')]; const s = await getDataScope(user); await assertDocumentAllowed(s, user, { warehouseId: 22, operatorId: 7 }); await assertDocumentAllowed(s, user, { warehouseId: 33, operatorId: 8 }); await assert.rejects(assertDocumentAllowed(s, user, { warehouseId: 11, operatorId: 8 })); });
  await check('warehouse scope preserves original AND/OR and explicit warehouse', async () => { roles = [role('a', 'CUSTOM', '1')]; const s = await getDataScope(user); const where = { warehouseId: 22, OR: [{ name: 'one' }, { name: 'two' }], AND: [{ status: 1 }] }; const before = JSON.stringify(where); const result = withWarehouseScope(where, s); assert.equal(JSON.stringify(where), before); assert.deepEqual(plain(result.AND[0]), where); assert.deepEqual(plain(result.AND[1]), { warehouseId: { in: [11] } }); });
  await check('relation warehouse and empty scope never use wrong scalar', async () => { const result = withWarehouseScope({ warehouse: { status: 1 } }, { warehouseIds: [] }, { field: 'warehouse' }); assert.deepEqual(plain(result.AND[1]), { warehouse: { id: { in: [] } } }); });
  await check('transfer OR scope preserves search OR via AND', async () => { roles = [role('a', 'CUSTOM', '1')]; const s = await getDataScope(user); const where = { OR: [{ orderNo: { contains: 'needle' } }, { status: 'DRAFT' }] }; const result = withDocumentScope(where, s, user, { transfer: true }); assert.deepEqual(plain(result.AND[0]), where); assert.equal(result.AND[1].OR.length, 2); await assertDocumentAllowed(s, user, { fromWhId: 22, toWhId: 11 }, { transfer: true }); await assert.rejects(assertDocumentAllowed(s, user, { fromWhId: 22, toWhId: 33 }, { transfer: true })); });
  await check('revocation next request, no 60s scope cache', async () => { roles = [role('a', 'ALL')]; assert.equal((await getDataScope(user)).warehouseIds, null); roles = [role('a', 'CUSTOM', '3')]; assert.deepEqual(plain((await getDataScope(user)).warehouseIds), [33]); roles = []; assert.deepEqual(plain((await getDataScope(user)).warehouseIds), []); });
  await check('disabled roles and invalid scope deny', async () => { roles = [{ ...role('a', 'ALL'), status: 0 }, role('b', 'INVALID')]; assert.deepEqual(plain((await getDataScope(user)).warehouseIds), []); });
  await check('scope resolution failure denies documents as well', async () => { failRoles = true; const s = await getDataScope(user); failRoles = false; await assert.rejects(assertDocumentAllowed(s, user, { warehouseId: 11, operatorId: 7 })); });
  await check('service missing actor, revoked permission, and out-of-scope warehouse deny', async () => { await assert.rejects(authorizeDataOperation(undefined, 'stock_in:create', { warehouseId: 11 }, { create: true })); roles = [role('a', 'CUSTOM', '1')]; principal = { ...user, permissions: ['stock_in:create'] }; await assert.rejects(authorizeDataOperation(7, 'stock_in:post', { warehouseId: 11 })); await assert.rejects(authorizeDataOperation(7, 'stock_in:create', { warehouseId: 22 }, { create: true })); await authorizeDataOperation(7, 'stock_in:create', { warehouseId: 11 }, { create: true }); });
  await check('service rejects SELF other-owner mutation', async () => { roles = [role('a', 'SELF')]; principal = { ...user, permissions: ['stock_out:post'] }; await assert.rejects(authorizeDataOperation(7, 'stock_out:post', { warehouseId: 11, operatorId: 8 })); await authorizeDataOperation(7, 'stock_out:post', { warehouseId: 22, operatorId: 7 }); });
  const routeFiles: string[] = [];
  const visit = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, entry.name); if (entry.isDirectory()) visit(f); else if (entry.name === 'route.ts') routeFiles.push(f); } };
  for (const domain of ['inventory', 'stock-in', 'stock-out', 'stocktake', 'transfers', 'reports', 'export']) visit(path.join(root, 'src/app/api', domain));
  await check('all owned web CRUD handlers carry explicit permissions inside try', () => {
    let handlers = 0;
    for (const file of routeFiles.filter(f => !f.includes('/location/'))) {
      const text = readFileSync(file, 'utf8'); const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) if (ts.isFunctionDeclaration(node) && /^(GET|POST|PUT|PATCH|DELETE)$/.test(node.name?.text || '')) {
        const body = node.body?.getText(ast) || ''; assert.ok(body.includes('try {') && body.includes('requireAuth('), file); assert.ok(body.includes('requirePermission('), file); assert.ok(!body.includes('auth.session') && !body.includes('session.user'), file); handlers++;
      }
    }
    assert.ok(handlers >= 30); console.log('AUDIT handlers=' + handlers);
  });
  await check('stocktake item IDs bind to parent order', () => { const text = readFileSync(path.join(root, 'src/services/stocktake.service.ts'), 'utf8'); assert.ok(text.includes('where: { orderId: id, id: { in: itemIds } }')); assert.ok(text.includes('where: { id: entry.id, orderId: id }')); });
  const apiCalls: { method: string; args: any }[] = [];
  let requestUser: any = { ...user, permissions: ['inventory:view', 'report:export', 'stock_in:view'] };
  let detail: any = null;
  const apiDb = {
    inventory: {
      findMany: async (args: any) => { apiCalls.push({ method: 'inventory.list', args }); return []; },
      count: async (args: any) => { apiCalls.push({ method: 'inventory.count', args }); return 0; },
      findUnique: async () => detail,
      delete: async () => { throw Error('unexpected delete'); },
    },
    inboundOrder: { findMany: async (args: any) => { apiCalls.push({ method: 'inbound.export', args }); return []; } },
  };
  const loadRoute = (name: string) => {
    const m = { exports: {} as any };
    const text = readFileSync(path.join(root, 'src/app/api', name, 'route.ts'), 'utf8');
    vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
      exports: m.exports, module: m, URL, console,
      require: (dep: string) => {
        if (dep === '@/lib/auth-guard') return {
          requireAuth: async () => { if (!requestUser) throw { statusCode: 401 }; return { type: 'token', user: requestUser }; },
          requirePermission: async (code: string) => { if (!requestUser.roles.length || !requestUser.permissions.includes(code)) throw { statusCode: 403 }; },
        };
        if (dep === '@/lib/prisma') return { prisma: apiDb };
        if (dep === '@/lib/data-scope') return mod.exports;
        if (dep === '@/lib/serialize') return { serializeBigInt: (v: any) => v };
        if (dep === 'next/server') return { NextResponse: { json: (data: any, opts?: any) => ({ status: opts?.status || 200, data }) } };
        if (dep === '@/lib/errors') return { handleApiError: (e: any) => ({ status: e.statusCode || 500 }), successResponse: (data: any) => ({ status: 200, data }), errorResponse: (_msg: any, status = 400) => ({ status }) };
        throw Error('Unexpected route import: ' + dep);
      },
    }); return m.exports;
  };
  const inventoryRoute = loadRoute('inventory');
  const exportRoute = loadRoute('export');
  await check('inventory GET anonymous and empty-role users denied before query', async () => {
    requestUser = null; apiCalls.length = 0; assert.equal((await inventoryRoute.GET({ url: 'http://local/api/inventory' })).status, 401);
    requestUser = { ...user, roles: [], permissions: ['inventory:view'] }; assert.equal((await inventoryRoute.GET({ url: 'http://local/api/inventory' })).status, 403); assert.equal(apiCalls.length, 0);
  });
  await check('token inventory list and count share intersected scope', async () => {
    requestUser = { ...user, permissions: ['inventory:view'] }; roles = [role('a', 'CUSTOM', '1')]; apiCalls.length = 0;
    assert.equal((await inventoryRoute.GET({ url: 'http://local/api/inventory?warehouseId=22' })).status, 200);
    assert.equal(apiCalls.length, 2); assert.deepEqual(plain(apiCalls[0].args.where), plain(apiCalls[1].args.where)); assert.equal(apiCalls[0].args.where.AND[0].warehouseId, 22); assert.deepEqual(plain(apiCalls[0].args.where.AND[1]), { warehouseId: { in: [11] } });
  });
  await check('inventory detail scope and DELETE write permission enforced', async () => {
    detail = { warehouseId: 22 }; assert.equal((await inventoryRoute.GET({ url: 'http://local/api/inventory?id=1' })).status, 403);
    assert.equal((await inventoryRoute.DELETE({ url: 'http://local/api/inventory?id=1' })).status, 403);
    requestUser.permissions.push('inventory:delete'); assert.equal((await inventoryRoute.DELETE({ url: 'http://local/api/inventory?id=1' })).status, 403);
  });
  await check('export requires type-specific view and identical SELF document predicate', async () => {
    requestUser = { ...user, permissions: ['report:export'] }; apiCalls.length = 0;
    assert.equal((await exportRoute.GET({ url: 'http://local/api/export?type=INBOUND' })).status, 403); assert.equal(apiCalls.length, 0);
    requestUser.permissions.push('stock_in:view'); roles = [role('a', 'SELF')]; const result = await exportRoute.GET({ url: 'http://local/api/export?type=INBOUND' }); assert.equal(result.status, 200);
    assert.deepEqual(plain(apiCalls[0].args.where), plain(withDocumentScope({}, await getDataScope(user), user)));
  });
  console.log('PASS total=' + passed + '; offline helper and mocked route execution; real HTTP/DB integration not exercised');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
