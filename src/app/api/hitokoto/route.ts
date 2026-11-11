import { NextResponse } from 'next/server';

/**
 * 登录页「一言」（v1.2.4）
 *
 * 为什么走服务端代理而不是浏览器直连：
 *  1) 站点 CSP 的 connect-src 是 'self'，浏览器直连第三方会被拦（现在只是 Report-Only，将来收紧就断）；
 *  2) 第三方接口在国内网络不稳，放到服务端可以统一超时与缓存，失败时安静降级；
 *  3) 前端拿不到外部域名，隐私政策里也就不用写"向第三方发送请求"。
 *
 * 离线语义：前端先看 navigator.onLine，再请求本接口；本接口取不到就返回 success:false，
 * 前端一律不显示，绝不给用户看报错。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE = 'https://v1.hitokoto.cn/?encode=json&c=k&c=d';
const TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_SIZE = 8;

const globalForHito = globalThis as unknown as {
  __hitoPool?: { at: number; items: { text: string; from: string }[] };
};

const FALLBACK_STYLE = { 'Cache-Control': 'no-store' } as const;

async function fetchOne(): Promise<{ text: string; from: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SOURCE, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const text = String(data?.hitokoto || '').trim();
    if (!text) return null;
    const from = String(data?.from || data?.from_who || '').trim();
    return { text: text.slice(0, 120), from: from.slice(0, 40) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const pool = globalForHito.__hitoPool;
  const fresh = pool && Date.now() - pool.at < CACHE_TTL_MS && pool.items.length > 0;

  if (fresh) {
    const pick = pool!.items[Math.floor(Math.random() * pool!.items.length)];
    return NextResponse.json(
      { success: true, data: { ...pick, cached: true } },
      { headers: FALLBACK_STYLE },
    );
  }

  // 并发补齐一批，任一条成功即可用；全部失败就明确说没取到
  const results = await Promise.all(Array.from({ length: 3 }, () => fetchOne()));
  const items = results.filter(Boolean) as { text: string; from: string }[];

  if (items.length === 0) {
    return NextResponse.json(
      { success: false, error: '暂时取不到内容' },
      { status: 200, headers: FALLBACK_STYLE },
    );
  }

  globalForHito.__hitoPool = { at: Date.now(), items: items.slice(0, CACHE_SIZE) };
  const pick = items[Math.floor(Math.random() * items.length)];
  return NextResponse.json(
    { success: true, data: { ...pick, cached: false } },
    { headers: FALLBACK_STYLE },
  );
}
