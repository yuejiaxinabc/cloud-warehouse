import crypto from 'crypto';
import { redis } from './redis';

/**
 * 服务端会话吊销（H3）
 *
 * NextAuth 的 JWT 会话是无状态 JWE：/api/auth/signout 只是让浏览器删掉 Cookie，
 * 服务端不留任何痕迹 —— 实测登出后拿旧 token 仍能访问 /api/settings/profile 直到 24h 过期。
 * 站点走 HTTP 明文时，被嗅探到的 token 等于「登出也没用」。
 *
 * 修法：登录时给会话发一个随机 sid 写进 JWT；登出（NextAuth signOut 事件）把 sid 拉黑；
 * 所有鉴权入口统一检查黑名单。多实例部署走 Redis，单机部署降级为进程内表（与 rate-limit 同策略）。
 */
const globalForRev = globalThis as unknown as { __revokedSids?: Map<string, number> };
const mem = (globalForRev.__revokedSids ??= new Map<string, number>());

let redisDisabledUntil = 0;
const REDIS_RETRY_MS = 30_000;
const PREFIX = 'revoke:sid:';

function useRedis(): boolean {
  return Date.now() > redisDisabledUntil;
}

/** 生成会话 id（登录时写入 JWT） */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/** 吊销某个会话（登出 / 管理员踢人 / 改密后强制下线） */
export async function revokeSession(sid: string | undefined | null, ttlMs = 24 * 3600 * 1000): Promise<void> {
  const key = String(sid || '').trim();
  if (!key) return;
  const ttl = Math.max(1000, ttlMs);

  if (useRedis()) {
    try {
      await redis.set(PREFIX + key, '1', 'PX', ttl);
      return;
    } catch {
      redisDisabledUntil = Date.now() + REDIS_RETRY_MS;
      console.warn('[session] Redis 不可用，吊销记录降级为进程内（多实例场景下不准确）');
    }
  }

  mem.set(key, Date.now() + ttl);
  // 顺手清掉过期项，避免进程内存无限增长
  const now = Date.now();
  for (const [k, exp] of mem) {
    if (exp <= now) mem.delete(k);
  }
}

/** 会话是否已被吊销 */
export async function isSessionRevoked(sid: string | undefined | null): Promise<boolean> {
  const key = String(sid || '').trim();
  if (!key) return false;

  const localExpiry = mem.get(key);
  if (localExpiry && localExpiry > Date.now()) return true;
  if (useRedis()) {
    try {
      return (await redis.exists(PREFIX + key)) === 1;
    } catch {
      redisDisabledUntil = Date.now() + REDIS_RETRY_MS;
    }
  }

  const exp = mem.get(key);
  if (!exp) return false;
  if (exp <= Date.now()) {
    mem.delete(key);
    return false;
  }
  return true;
}
