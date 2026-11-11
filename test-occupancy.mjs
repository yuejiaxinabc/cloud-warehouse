// FIX-2026-1029 货位独占规则 · 端到端验证脚本（在服务器上运行后即删）
// 用 NEXTAUTH_SECRET 铸造临时会话，走真实 HTTP API 验证：
//   T0 会话可用
//   T1 同商品续放同货位 → 允许
//   T2 不同商品上到已占用货位 → 拒绝
//   T3 空货位入新商品 → 允许
//   T4 货位分配接口（后台直接写货位）异品 → 拒绝
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3000';
const WH = 3;            // 仓库
const LOC_OCCUPIED = 5202; // A-01-01-02，已有商品22 × 84
const PROD_A = 22;         // UI测试商品A（占用者）
const PROD_B = 21;         // QA测试商品（异品）
const LOC_EMPTY = 5204;    // A-01-01-04，空

const env = readFileSync('/opt/cloud-warehouse/.env', 'utf8');
let secret = (env.match(/^NEXTAUTH_SECRET=(.+)$/m) || [])[1].trim();
if ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) {
  secret = secret.slice(1, -1); // .env 里带引号，dotenv 会剥掉，这里必须同步
}
const { encode } = await import('next-auth/jwt');
const jwt = await encode({
  secret,
  token: { sub: '1', name: 'admin', username: 'admin', roles: ['admin'], permissions: ['*'] },
  maxAge: 3600,
});
const H = { 'Content-Type': 'application/json', Cookie: 'next-auth.session-token=' + jwt, Origin: BASE };

async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: H, body: JSON.stringify(body) });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
async function get(path) {
  const r = await fetch(BASE + path, { headers: H });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name} :: ${detail}`); }
}

// T0 会话可用性
const t0 = await get('/api/stock-in?page=1&pageSize=1');
check('T0 会话可用（GET /api/stock-in 200）', t0.status === 200 && t0.json?.success, JSON.stringify(t0).slice(0, 200));

async function createAndPost(productId, locationId, qty, tag) {
  const c = await post('/api/stock-in', {
    type: 'PURCHASE', warehouseId: WH, remark: `验证脚本-${tag}`,
    items: [{ productId, planQty: qty, locationId, unitPrice: 1 }],
  });
  if (!c.json?.success) return { error: '创建失败: ' + JSON.stringify(c.json) };
  const orderId = c.json.data.id;
  const p = await post(`/api/stock-in/${orderId}/post`, {});
  return { orderId, postStatus: p.status, postJson: p.json };
}

// T1 同商品续放 → 允许
const t1 = await createAndPost(PROD_A, LOC_OCCUPIED, 6, 'T1-同品续放');
check('T1 同商品(22)续放 A-01-01-02 → 允许', t1.postJson?.success === true, JSON.stringify(t1).slice(0, 300));

// T2 异品 → 拒绝
const t2 = await createAndPost(PROD_B, LOC_OCCUPIED, 3, 'T2-异品拦截');
const t2blocked = t2.postJson?.success === false && /占用|同一种商品/.test(t2.postJson?.error || '');
check('T2 异品(21)上到 A-01-01-02 → 拒绝', t2blocked, JSON.stringify(t2).slice(0, 300));

// T3 空货位入新商品 → 允许
const t3 = await createAndPost(PROD_B, LOC_EMPTY, 5, 'T3-空货位');
check('T3 异品(21)上到空货位 A-01-01-04 → 允许', t3.postJson?.success === true, JSON.stringify(t3).slice(0, 300));

// T4 货位分配接口（后台直接写货位库存）异品 → 拒绝
const t4 = await post('/api/location-stocks', { productId: PROD_B, warehouseId: WH, locationId: LOC_OCCUPIED, quantity: 1 });
const t4blocked = t4.json?.success === false && /占用|同一种商品/.test(t4.json?.error || '');
check('T4 货位分配接口异品(21)→5202 → 拒绝', t4blocked, JSON.stringify(t4).slice(0, 300));

// 最终数据核对：5202 上只应有商品22，数量 = 84 + 6 = 90
const ls = await get(`/api/location-stocks?warehouseId=${WH}`);
const rows = (ls.json?.data || []).filter((r) => Number(r.quantity) > 0 && Number(r.locationId) === LOC_OCCUPIED);
const pids = [...new Set(rows.map((r) => String(r.productId)))];
const total = rows.reduce((s, r) => s + Number(r.quantity), 0);
check('终态 5202 只有商品22 且数量=90', pids.length === 1 && pids[0] === String(PROD_A) && total === 90, JSON.stringify(rows));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
