const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../../..');
// Isolated module loader: database/auth imports are explicit doubles, never real connections.
function load(relative, mocks = {}) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const localRequire = name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks);
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name)) + '.ts', mocks);
    if (name === 'next/server') return { NextResponse: { json: (body, opts) => Response.json(body, opts) } };
    if (['@prisma/client', 'zod'].includes(name)) return require(name);
    throw new Error('Unexpected dependency (network/DB disabled): ' + name);
  };
  new Function('require', 'module', 'exports', source)(localRequire, mod, mod.exports);
  return mod.exports;
}
const { AppError } = load('src/lib/errors.ts');
const errors = { AppError, handleApiError: e => Response.json({ success: false, error: e.message }, { status: e.statusCode || 500 }) };
const pagination = load('src/lib/pagination.ts', { './errors': errors });
const invalid = ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity', 'abc', '1abc', '1e2', '0x10', '9007199254740992', '999999999999999999999999', '+1'];
for (const key of ['page', 'pageSize']) for (const value of invalid) test('reject ' + key + '=' + JSON.stringify(value), () => {
  assert.throws(() => pagination.parsePagination(new URLSearchParams({ [key]: value })), e => e.statusCode === 400);
});
test('defaults, maximum size, existing filters and integer offsets', () => {
  assert.deepEqual(pagination.parsePagination(new URLSearchParams()), { page: 1, pageSize: 20, skip: 0 });
  const params = new URLSearchParams('page=2&pageSize=200&keyword=bolt&categoryId=3&status=1&sort=-name');
  assert.deepEqual(pagination.parsePagination(params), { page: 2, pageSize: 200, skip: 200 });
  assert.equal(params.get('keyword'), 'bolt');
  assert.throws(() => pagination.parsePagination(new URLSearchParams('pageSize=201')), e => e.statusCode === 400);
  assert.throws(() => pagination.parsePagination(new URLSearchParams('page=2147483647&pageSize=200')), e => e.statusCode === 400);
  assert.throws(() => pagination.parsePagination(new URLSearchParams('page=1&page=2')), e => e.statusCode === 400);
});
function productRoute() {
  const queries = [];
  const session = { user: { id: '42', roles: ['admin'] } };
  const mocks = {
    '@/lib/errors': errors, '@/lib/pagination': pagination,
    '@/lib/auth': {}, '@/lib/log': {}, '@/lib/location-binding': {}, '@/lib/location-occupancy': {}, '@/lib/webhook': {}, '@/lib/product-guard': {},
    '@/lib/auth-guard': { requireAuth: async () => ({ type: 'session', session, user: session.user }), getSessionChecked: async () => session },
    '@/app/api/warehouse/access': { businessAccess: async () => ({ scope: { warehouseIds: null } }), withWarehouseScope: where => where },
    '@/lib/serialize': { serializeBigInt: x => x },
    '@/lib/prisma': { prisma: { product: { findMany: async q => { queries.push(q); return [{ id: 1, inventories: [{ onHand: 3 }] }]; }, count: async () => 1 } } },
  };
  return { route: load('src/app/api/products/route.ts', mocks), queries };
}
for (const key of ['page', 'pageSize']) for (const value of [...invalid, ...(key === 'pageSize' ? ['201'] : [])]) test('GET products 400 before DB: ' + key + '=' + JSON.stringify(value), async () => {
  const { route, queries } = productRoute();
  const response = await route.GET({ url: 'http://local/api/products?' + new URLSearchParams({ [key]: value }) });
  assert.equal(response.status, 400); assert.equal(queries.length, 0);
});
test('GET products preserves filter, order, pagination and stock', async () => {
  const { route, queries } = productRoute();
  const response = await route.GET({ url: 'http://local/api/products?page=2&pageSize=200&keyword=bolt&categoryId=3&status=1&sort=-name' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.data.items[0].totalStock, 3); assert.equal(result.data.page, 2);
  assert.equal(queries[0].take, 200); assert.equal(queries[0].skip, 200);
  assert.equal(queries[0].where.categoryId, 3); assert.equal(queries[0].where.status, 1);
  assert.deepEqual(queries[0].orderBy, { name: 'desc' });
});
test('purchase applicant identity comes only from checked Session', async () => {
  let written;
  const session = { user: { id: '42', name: 'Server User' } };
  const route = load('src/app/api/purchase-requests/route.ts', {
    '@/app/api/warehouse/access': { businessAccess: async () => ({ session, scope: {}, user: { id: 42 } }), assertWarehouseAllowed: async () => {} },
    '@/lib/data-scope': {}, '@/lib/errors': errors, '@/lib/auth-guard': {},
    '@/lib/order-no': { createWithOrderNo: async (_, options) => options.create('GQ-test') },
    '@/lib/prisma': { prisma: { purchaseRequest: { create: async ({ data }) => { written = data; return data; } } } },
    '@/lib/serialize': { serializeBigInt: x => x },
  });
  const response = await route.POST({ json: async () => ({ name: 'Bolt', quantity: 2, applicant: 'Fake', applicantId: 99 }) });
  assert.equal(response.status, 200); assert.equal(written.applicantId, 42); assert.equal(written.applicant, 'Server User');
});
test('warehouse create/update/delete audit the checked session user', async () => {
  const logs = [];
  const session = { user: { id: '42' } };
  const warehouse = { id: 3n, name: 'Test', code: 'T' };
  const prisma = { warehouse: { create: async () => warehouse, update: async () => warehouse }, inventory: { findFirst: async () => null } };
  prisma.$transaction = fn => fn(prisma);
  const route = load('src/app/api/warehouse/route.ts', {
    'next-auth': {}, '@/lib/auth': {}, '@/lib/errors': errors,
    './access': { businessAccess: async () => ({ scope: { mode: 'ALL', warehouseIds: null } }), assertWarehouseAllowed: async () => {} },
    '@/lib/auth-guard': { requireRole: async () => session },
    '@/lib/prisma': { prisma }, '@/lib/serialize': { serializeBigInt: x => JSON.parse(JSON.stringify(x, (_, v) => typeof v === 'bigint' ? String(v) : v)) },
    '@/lib/shelf-init': { ensureShelves: async () => {} },
    '@/lib/log': { writeLog: async log => logs.push(log), getClientIp: () => 'test' },
  });
  const req = { url: 'http://local/api/warehouse?id=3', json: async () => ({ name: 'Test', code: 'T', userId: 99 }) };
  for (const verb of ['POST', 'PUT', 'DELETE']) assert.equal((await route[verb](req)).status, 200);
  assert.deepEqual(logs.map(log => log.userId), ['42', '42', '42']);
  assert.deepEqual(logs.map(log => log.action), ['create', 'update', 'delete']);
});
test('warehouse helper preserves denied/SELF organization warehouse filters', async () => {
  const helper = load('src/app/api/warehouse/access.ts', { '@/lib/auth-guard': {}, '@/lib/data-scope': {}, '@/lib/prisma': {}, '@/lib/errors': errors });
  assert.deepEqual(helper.warehouseWhere({ warehouseIds: [] }), { deletedAt: null, id: { in: [] } });
  assert.deepEqual(helper.warehouseWhere({ warehouseIds: [7] }), { deletedAt: null, id: { in: [7] } });
  assert.deepEqual(helper.warehouseWhere({ warehouseIds: null }), { deletedAt: null });
});
test('purchase helper binds location and has no post-posting stock writes', async () => {
  let created; let posts = 0;
  const helper = load('src/lib/purchase-inbound.ts', {
    '@/lib/errors': errors, './errors': errors,
    '@/lib/prisma': { prisma: { product: { findMany: async () => [{ id: 1n, model: null }] } } },
    '@/services/stock-in.service': { StockInService: { create: async data => { created = data; return { id: 9n }; }, post: async () => { posts++; } } },
  });
  const request = { id: 1n, requestNo: 'GQ', name: 'Bolt', model: null, color: null, size: null, quantity: 2 };
  await helper.inboundPurchaseRequest(request, { warehouseId: 1, locationId: 2 }, 42);
  assert.equal(created.items[0].locationId, 2); assert.equal(created.operatorId, 42); assert.equal(posts, 1);
  await assert.rejects(helper.inboundPurchaseRequest(request, { warehouseId: 1, locationId: 2, boxId: 3 }, 42), e => e.statusCode === 400);
  assert.equal(posts, 1);
});
module.exports = { load, errors };
