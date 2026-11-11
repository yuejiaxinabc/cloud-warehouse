import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateSystemToken } from './api-token';
import { loadAccountState, assertTokenPermission } from './account-state';
import { UnauthorizedError, AppError } from './errors';

export type MpAuth = { token: string; userId: number | null; user: NonNullable<Awaited<ReturnType<typeof loadAccountState>>> };
export async function requireMpToken(req: NextRequest): Promise<MpAuth> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : new URL(req.url).searchParams.get('token') || '';
  if (!token) throw new UnauthorizedError();
  const session = await prisma.mpSession.findUnique({ where: { token }, select: { id: true, userId: true, expiresAt: true } });
  let principal;
  if (session) {
    if (session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedError('登录已过期，请重新登录');
    principal = await loadAccountState(session.userId);
    const version = token.split('.')[0];
    if (!principal || version !== 'v' + principal.sessionVersion) throw new UnauthorizedError('会话已失效，请重新登录');
  } else principal = await validateSystemToken(token);
  if (!principal) throw new UnauthorizedError('Token 无效，请重新登录');
  assertTokenPermission(principal, new URL(req.url).pathname, req.method, session ? undefined : ['read']);
  return { token, userId: Number(principal.id), user: principal };
}
export function mpErrorResponse(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.statusCode });
  console.error('[mp-auth]', error);
  return NextResponse.json({ success: false, error: '服务暂不可用' }, { status: 503 });
}
