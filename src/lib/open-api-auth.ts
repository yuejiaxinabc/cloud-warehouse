import type { NextRequest } from 'next/server';
import { validateSystemToken } from './api-token';
import { validateApiToken } from './token-auth';
import { assertTokenPermission } from './account-state';

export async function requireOpenApi(req: NextRequest): Promise<{ ok: boolean; error?: string }> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers.get('x-api-token') || new URL(req.url).searchParams.get('token') || '';
  const principal = await validateSystemToken(token);
  if (principal) {
    assertTokenPermission(principal, new URL(req.url).pathname, req.method, ['read']);
    return { ok: true };
  }
  const legacy = await validateApiToken(req);
  return legacy.valid ? { ok: true } : { ok: false, error: legacy.error || 'Token 无效或已过期' };
}
