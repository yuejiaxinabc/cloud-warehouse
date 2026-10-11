import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { NextResponse, NextRequest } from 'next/server';

/**
 * 检查当前会话是否为管理员，返回 session 或抛错
 * 管理员 = roles 数组中包含 'admin'
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new Error('请先登录');
  }
  const roles = (session.user as any)?.roles || [];
  if (!roles.includes('admin')) {
    throw new Error('权限不足，仅管理员可操作');
  }
  return session;
}

/**
 * 检查当前会话是否已登录，返回 session 或抛错
 */
export async function requireLogin() {
  const session = await getServerSession(authOptions);
  if (!session) {
    throw new Error('请先登录');
  }
  return session;
}

/**
 * API 权限校验失败时的统一响应
 */
export function authErrorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : '未知错误';
  const status = msg.includes('权限不足') ? 403 : 401;
  return NextResponse.json(
    { success: false, error: msg },
    { status }
  );
}

/**
 * 统一认证检查：先查 session，再查 API Token
 * 用于所有需要认证的 API 路由
 */
export async function requireAuth(req?: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session) return { type: 'session' as const, session };

  // 尝试 API Token 认证
  if (req) {
    const { validateApiToken } = await import('./token-auth');
    const auth = await validateApiToken(req);
    if (auth.valid) return { type: 'token' as const, userId: auth.userId };
  }

  throw new Error('请先登录');
}
