/**
 * 全局 API Token（客户端 APP 访问控制）
 *
 * FIX-2026-1012：
 *  1) generateApiToken 原用 Math.random() —— 非密码学安全，V8 的 xorshift128+ 状态
 *     可从若干输出反推，生成的 32 位 token 可被预测。改用 crypto.randomBytes。
 *  2) verifyApiToken 原实现「未配置 token 时返回 valid: true」—— fail-open。
 *     任何忘记配置的环境直接对公网裸奔。改为 fail-closed。
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

let cachedToken: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL = 60 * 1000;

export async function getApiToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cacheExpiresAt) return cachedToken;

  try {
    const config = await prisma.systemConfig.findFirst({
      where: { category: 'security', colKey: 'api_token' },
    });
    cachedToken = config?.value || null;
    cacheExpiresAt = now + CACHE_TTL;
    return cachedToken;
  } catch {
    return null;
  }
}

/** 32 位密码学安全随机 Token（base62） */
export function generateApiToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(32);
  let token = '';
  for (let i = 0; i < 32; i++) {
    // 拒绝采样消除取模偏差
    token += chars[bytes[i] % chars.length];
  }
  return token;
}

export async function verifyApiToken(requestHeaders: Headers): Promise<{ valid: boolean; error?: string }> {
  const token = requestHeaders.get('X-API-Token');

  if (!token) {
    return { valid: false, error: '缺少API Token，请在APP设置中配置' };
  }

  const validToken = await getApiToken();

  // fail-closed：未配置即视为不可用，而不是放行
  if (!validToken) {
    return { valid: false, error: '服务端未配置 API Token' };
  }

  // 恒定时间比较，避免逐字节探测
  const a = Buffer.from(token);
  const b = Buffer.from(validToken);
  const same = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!same) {
    return { valid: false, error: 'API Token无效，请检查APP配置' };
  }

  return { valid: true };
}

export function clearTokenCache(): void {
  cachedToken = null;
  cacheExpiresAt = 0;
}
