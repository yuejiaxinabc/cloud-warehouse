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
