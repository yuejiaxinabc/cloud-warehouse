import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadAccountState, assertTokenPermission } from './account-state';

export async function validateApiToken(req: NextRequest): Promise<{ valid: boolean; userId?: number; permissions?: string[]; error?: string }> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers.get('x-api-token') || new URL(req.url).searchParams.get('token');
  if (!token) return { valid: false, error: '缺少 API Token' };
  const rows = await prisma.$queryRaw`SELECT id, user_id, permissions, expires_at, status FROM api_tokens WHERE token = ${token} LIMIT 1` as any[];
  const row = rows[0];
  if (!row || row.status !== 1 || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) return { valid: false, error: 'Token 无效或已过期' };
  let grant: any;
  try { grant = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions; } catch { return { valid: false, error: 'Token 需重新签发' }; }
  const principal = await loadAccountState(row.user_id);
  if (!principal || !Number.isInteger(grant?.sessionVersion) || grant.sessionVersion !== principal.sessionVersion || !Array.isArray(grant.permissions)) return { valid: false, error: 'Token 主体或版本已失效，请重新签发' };
  assertTokenPermission(principal, new URL(req.url).pathname, req.method, grant.permissions);
  await prisma.$executeRaw`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${row.id}`;
  return { valid: true, userId: Number(principal.id), permissions: grant.permissions };
}
export function hasPermission(permissions: string[], required: string) {
  return Array.isArray(permissions) && (permissions.includes('*') || permissions.includes(required));
}
