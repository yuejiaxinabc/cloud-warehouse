import { redis } from './redis';

/**
 * 统一速率限制 / 登录失败计数
 *
 * FIX-2026-1012：
 * 1) 原实现是 middleware 里的进程内 Map —— 多实例部署形同虚设，重启即清零；
 *    且 middleware 跑在 Edge runtime 拿不到 ioredis，所以真正的计数必须放在
 *    Node runtime（authorize / route handler）里做。
 * 2) 覆盖 Redis 不可用的情况：自动降级到进程内 Map，并明确告警，
 *    不允许「连不上 Redis 就完全不限速」这种静默失效。
 */

type MemEntry = { count: number; resetAt: number };

const globalForRL = globalThis as unknown as {
  __rlMem?: Map<string, MemEntry>;
};
const mem = (globalForRL.__rlMem ??= new Map<string, MemEntry>());

let redisDisabledUntil = 0;
const REDIS_RETRY_MS = 30_000;

function shouldUseRedis(): boolean {
  return Date.now() > redisDisabledUntil;
}

export type HitResult = { allowed: boolean; remaining: number; resetMs: number };

/** 固定窗口计数（Redis 优先，失败降级内存） */
export async function hit(key: string, limit: number, windowMs: number): Promise<HitResult> {
  if (shouldUseRedis()) {
    try {
      const rk = 'rl:' + key;
      const n = await redis.incr(rk);
      if (n === 1) await redis.pexpire(rk, windowMs);
      const ttl = await redis.pttl(rk);
      return { allowed: n <= limit, remaining: Math.max(0, limit - n), resetMs: ttl > 0 ? ttl : windowMs };
    } catch {
      redisDisabledUntil = Date.now() + REDIS_RETRY_MS;
      console.warn('[rate-limit] Redis 不可用，降级为进程内计数（多实例场景下不准确）');
    }
  }

  const now = Date.now();
  const e = mem.get(key);
  if (!e || now > e.resetAt) {
    mem.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: 1 <= limit, remaining: Math.max(0, limit - 1), resetMs: windowMs };
  }
  e.count += 1;
  return { allowed: e.count <= limit, remaining: Math.max(0, limit - e.count), resetMs: e.resetAt - now };
}

/** 清零（登录成功后调用） */
export async function reset(key: string): Promise<void> {
  if (shouldUseRedis()) {
    try {
      await redis.del('rl:' + key);
      return;
    } catch {
      redisDisabledUntil = Date.now() + REDIS_RETRY_MS;
    }
  }
  mem.delete(key);
}

/** 兼容 Headers 实例与 next-auth 传入的普通对象两种形态 */
export type HeaderLike = Headers | Record<string, string | string[] | undefined>;

function readHeader(h: HeaderLike, name: string): string | undefined {
  if (typeof (h as Headers).get === 'function') {
    const v = (h as Headers).get(name);
    return v ?? undefined;
  }
  const obj = h as Record<string, string | string[] | undefined>;
  const v = obj[name] ?? obj[name.toLowerCase()] ?? obj[name.toUpperCase()];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

/**
 * 只信任 nginx 用 $remote_addr 覆写的 X-Real-IP；XFF 首段可被客户端伪造。
 *
 * FIX-2026-1012：next-auth v4 传给 authorize() 的 req.headers 是普通对象
 * （Record<string, any>），不是 Headers 实例。原先直接当 Headers 用会在
 * 每次登录时抛 TypeError，因此这里做双形态兼容。
 */
export function clientIp(headers: HeaderLike): string {
  const realIp = readHeader(headers, 'x-real-ip');
  if (realIp) return realIp.trim();

  const xff = readHeader(headers, 'x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return 'unknown';
}
