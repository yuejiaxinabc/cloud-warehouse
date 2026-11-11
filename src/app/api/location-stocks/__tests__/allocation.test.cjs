const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { load, errors } = require('../../products/__tests__/business.test.cjs');
const { allocateLocation } = load('src/app/api/location-stocks/allocate.ts', { '@/lib/errors': errors, './errors': errors });
const D = x => new Prisma.Decimal(x);
function fixture({ onHand = 10, rows = [], foreign = false, capacity = null, wrongWarehouse = false } = {}) {
  let state = rows.map((r, i) => ({ id: BigInt(i + 1), inventoryId: 1n, productId: 1n, warehouseId: 1n, locationId: 1n, boxId: null, lotNumber: 'L1', ...r, quantity: D(r.quantity) }));
  const inventory = { id: 1n, onHand: D(onHand), locked: D(2), available: D(onHand - 2) };
  const locks = [];
  const tx = {
    $queryRaw: async strings => { locks.push(strings.join('?')); return [{ id: 1n }]; },
    inventory: { findUnique: async () => inventory },
    location: { findUnique: async () => ({ id: 2n, status: 1, capacity: capacity == null ? null : D(capacity), zone: { warehouseId: wrongWarehouse ? 9n : 1n, status: 1 } }) },
    box: { findUnique: async () => ({ locationId: 2n, status: 1 }) },
    inventoryLot: { findMany: async () => [{ quantity: D(onHand) }] },
    locationStock: {
      findFirst: async () => foreign ? { productId: 99n } : null,
      findMany: async () => state.map(r => ({ ...r })),
      aggregate: async () => ({ _sum: { quantity: state.filter(r => r.locationId === 2n).reduce((s, r) => s.add(r.quantity), D(0)) } }),
      delete: async ({ where }) => { state = state.filter(r => r.id !== where.id); },
      update: async ({ where, data }) => { const row = state.find(r => r.id === where.id); row.quantity = data.quantity.increment ? row.quantity.add(data.quantity.increment) : data.quantity; },
      create: async ({ data }) => { state.push({ id: BigInt(state.length + 100), ...data }); },
    },
  };
  return { tx, rows: () => state, inventory, locks };
}
const body = { productId: 1, warehouseId: 1, locationId: 2, quantity: 4 };
test('move conserves total and batch, leaves all master balances unchanged', async () => {
  const f = fixture({ rows: [{ quantity: 10 }] });
  await allocateLocation(f.tx, body);
  assert.equal(f.rows().reduce((n, r) => n + Number(r.quantity), 0), 10);
  assert.equal(Number(f.rows().find(r => r.locationId === 1n).quantity), 6);
  assert.equal(f.rows().find(r => r.locationId === 2n).lotNumber, 'L1');
  assert.equal(Number(f.inventory.onHand), 10); assert.equal(Number(f.inventory.locked), 2); assert.equal(Number(f.inventory.available), 8);
  assert.match(f.locks[0], /FROM inventory.*FOR UPDATE/); assert.match(f.locks[1], /FROM locations.*FOR UPDATE/);
});
test('existing target increments only by deducting sources', async () => {
  const f = fixture({ rows: [{ quantity: 6 }, { locationId: 2n, quantity: 4 }] });
  await allocateLocation(f.tx, body);
  assert.equal(Number(f.rows().find(r => r.locationId === 2n).quantity), 8);
  assert.equal(Number(f.rows().find(r => r.locationId === 1n).quantity), 2);
});
test('repeat full allocation fails without duplicating quantity', async () => {
  const f = fixture({ rows: [{ quantity: 10 }] });
  await allocateLocation(f.tx, { ...body, quantity: 10 });
  await assert.rejects(allocateLocation(f.tx, { ...body, quantity: 10 }), e => e.statusCode === 400);
  assert.equal(f.rows().length, 1); assert.equal(Number(f.rows()[0].quantity), 10);
});
test('unassigned quantity is bounded; no invented latest batch', async () => {
  const f = fixture(); await allocateLocation(f.tx, body);
  assert.equal(Number(f.rows()[0].quantity), 4); assert.equal(f.rows()[0].lotNumber, null);
  assert.equal(Number(f.inventory.onHand), 10);
});
for (const [name, options, request, status] of [
  ['over onHand', { rows: [{ quantity: 10 }] }, { ...body, quantity: 11 }, 400],
  ['historical excess', { rows: [{ quantity: 11 }] }, body, 409],
  ['foreign product', { foreign: true }, body, 400],
  ['wrong warehouse', { wrongWarehouse: true }, body, 400],
  ['capacity', { capacity: 3 }, body, 400],
  ['fraction precision', {}, { ...body, quantity: 0.0001 }, 400],
  ['negative', {}, { ...body, quantity: -1 }, 400],
  ['NaN', {}, { ...body, quantity: 'NaN' }, 400],
  ['bad id', {}, { ...body, locationId: '1.2' }, 400],
]) test(name + ' fails before mutation', async () => {
  const f = fixture(options); const before = JSON.stringify(f.rows(), (_, v) => typeof v === 'bigint' ? String(v) : v);
  await assert.rejects(allocateLocation(f.tx, request), e => e.statusCode === status);
  assert.equal(JSON.stringify(f.rows(), (_, v) => typeof v === 'bigint' ? String(v) : v), before);
});
