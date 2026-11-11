import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { loadAccountState } from './account-state';

// No authorization cache: disabling a user or rotating a token takes effect immediately.
export async function getApiToken(): Promise<string | null> {
  const row = await prisma.systemConfig.findFirst({ where: { category: 'security', colKey: 'api_token' } });
  return row?.value || null;
}
export function generateApiToken(): string { return crypto.randomBytes(32).toString('hex'); }
export function clearTokenCache(): void {}

export async function validateSystemToken(token: string) {
  const rows = await prisma.systemConfig.findMany({ where: { category: 'security', colKey: { in: ['api_token', 'api_token_owner'] } } });
  const configured = rows.find(r => r.colKey === 'api_token')?.value;
  if (!configured || !token) return null;
  const a = Buffer.from(token), b = Buffer.from(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let owner: any;
  try { owner = JSON.parse(rows.find(r => r.colKey === 'api_token_owner')?.value || '{}'); } catch { return null; }
  const principal = await loadAccountState(owner.userId);
  if (!principal || !Number.isInteger(owner.sessionVersion) || owner.sessionVersion !== principal.sessionVersion) return null;
  return principal;
}
export async function verifyApiToken(headers: Headers): Promise<{ valid: boolean; error?: string }> {
  const principal = await validateSystemToken(headers.get('x-api-token') || '');
  return principal ? { valid: true } : { valid: false, error: 'API Token或绑定账号已失效，请管理员重新签发' };
}
