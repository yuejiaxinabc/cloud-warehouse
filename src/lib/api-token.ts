/**
 * API Token 验证中间件
 * 用于客户端 APP（Windows/Mac/iOS/Android/鸿蒙）的 API 访问控制
 * 
 * 工作流程：
 * 1. 管理员在 Web 端「系统设置 → API安全」生成 Token
 * 2. 客户端 APP 首次启动配置 API 地址 + Token
 * 3. 客户端所有 API 请求携带 Header: X-API-Token: <token>
 * 4. 后端验证 Token 后才允许访问
 */
import { prisma } from '@/lib/prisma';

// Token 缓存（避免每次请求都查数据库）
let cachedToken: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL = 60 * 1000; // 1分钟缓存

/**
 * 获取当前有效的 API Token
 */
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

/**
 * 生成新的 API Token（32位随机字符串）
 */
export function generateApiToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * 验证客户端请求中的 Token
 * @param requestHeaders 请求头
 * @returns { valid: boolean, error?: string }
 */
export async function verifyApiToken(requestHeaders: Headers): Promise<{ valid: boolean; error?: string }> {
  const token = requestHeaders.get('X-API-Token');
  
  if (!token) {
    return { valid: false, error: '缺少API Token，请在APP设置中配置' };
  }

  const validToken = await getApiToken();
  
  // 如果系统没有配置 Token，则允许访问（兼容 Web 端）
  if (!validToken) {
    return { valid: true };
  }

  if (token !== validToken) {
    return { valid: false, error: 'API Token无效，请检查APP配置' };
  }

  return { valid: true };
}

/**
 * 清除 Token 缓存（Token 更新后调用）
 */
export function clearTokenCache(): void {
  cachedToken = null;
  cacheExpiresAt = 0;
}
