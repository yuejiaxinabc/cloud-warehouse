const test = require('node:test');
const assert = require('node:assert/strict');
const { load, errors } = require('../../../products/__tests__/business.test.cjs');
function fixture({ status = 'DRAFT', foreignItem = false } = {}) {
  const events = [];
  const rows = [{ id: 1n, productId: 1n, locationId: null }, { id: 2n, productId: 2n, locationId: null }];
  const tx = { inboundOrder: { findUnique: async () => { events.push('read'); return { id: 1n, warehouseId: 1n, status, inboundItems: rows }; } },
    inboundItem: { update: async q => { events.push('write'); return q; } },
    location: { findUnique: async () => ({ status: 1, zone: { status: 1, warehouseId: 1n } }) },
    locationStock: { findFirst: async () => null },
  };
  const route = load('src/app/api/stock-in/[id]/location/route.ts', {
    '@/lib/errors': errors, './errors': errors,
    '@/app/api/warehouse/access': { businessAccess: async () => ({ scope: {}, user: { id: 42 } }) },
    '@/lib/data-scope': { assertDocumentAllowed: async () => events.push('scope') },
    '@/lib/order-lock': { lockOrderRow: async () => { events.push('lock'); return true; } },
    '@/lib/prisma': { prisma: { $transaction: async fn => { events.push('begin'); try { const value = await fn(tx); events.push('commit'); return value; } catch (e) { events.push('rollback'); throw e; } } } },
  });
  return { route, events };
}
test('draft binding uses transaction/order lock before state check', async () => {
  const f = fixture();
  const response = await f.route.POST({ json: async () => ({ items: [{ itemId: 1, locationId: 2 }] }) }, { params: { id: '1' } });
  assert.equal(response.status, 200); assert.deepEqual(f.events, ['begin', 'lock', 'read', 'scope', 'write', 'commit']);
});
test('posted order assignment rejected after lock with no writes', async () => {
  const f = fixture({ status: 'POSTED' });
  const response = await f.route.POST({ json: async () => ({ items: [{ itemId: 1, locationId: 2 }] }) }, { params: { id: '1' } });
  assert.equal(response.status, 400); assert.deepEqual(f.events, ['begin', 'lock', 'read', 'scope', 'rollback']);
});
test('draft same-location different products fail atomically', async () => {
  const f = fixture();
  const response = await f.route.POST({ json: async () => ({ items: [{ itemId: 1, locationId: 2 }, { itemId: 2, locationId: 2 }] }) }, { params: { id: '1' } });
  assert.equal(response.status, 400); assert.ok(!f.events.includes('write')); assert.equal(f.events.at(-1), 'rollback');
});
