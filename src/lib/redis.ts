import Redis from 'ioredis';

/**
 * Redis 连接单例
 * 用于缓存、队列等场景
 */

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });
}

export const redis = globalForRedis.redis ?? createRedisClient();

// FIX-2026-1012：ioredis 在连接失败时会 emit('error')。
// 没有监听器时 Node 会把未处理的 'error' 事件升级为未捕获异常，直接终止进程。
// 这里挂一个显式监听，把故障降级为日志（rate-limit 会据此回退到进程内计数）。
redis.on('error', (err: Error) => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[redis] 连接异常，相关功能将降级:', err.message);
  }
});
redis.on('end', () => {
  console.warn('[redis] 连接已关闭');
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

/**
 * 分布式锁实现（基于 Redis SETNX）
 */
export async function acquireLock(key: string, ttlMs: number = 30000): Promise<string | null> {
  const value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const result = await redis.set(`lock:${key}`, value, 'PX', ttlMs, 'NX');
  return result === 'OK' ? value : null;
}

/**
 * 释放分布式锁（仅释放自己持有的锁）
 */
export async function releaseLock(key: string, token: string): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, `lock:${key}`, token);
  return result === 1;
}
