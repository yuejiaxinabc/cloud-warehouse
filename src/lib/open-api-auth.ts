import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { getApiToken } from './api-token';
import { validateApiToken } from './token-auth';

/**
 * 开放 API 鉴权（v1.2.0）
 * 同时兼容两套 Token：
 *  1) 系统设置里生成的 API Token（存 system_configs.security.api_token，可在设置页轮换）
 *  2) 历史 api_tokens 表里的 token（多用户/多 token 场景）
 * 一律用定长比较，避免时序侧信道。
 */
export async function requireOpenApi(req: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || (req.headers.get('x-api-token') || '').trim() || (req.nextUrl.searchParams.get('token') || '').trim();

  if (!token) return { ok: false, error: '缺少 API Token（Authorization: Bearer <token>）' };

  const configured = await getApiToken();
  if (configured) {
    const a = Buffer.from(token);
    const b = Buffer.from(configured);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }

  const legacy = await validateApiToken(req);
  if (legacy.valid) return { ok: true };

  return { ok: false, error: 'Token 无效或已过期' };
}
