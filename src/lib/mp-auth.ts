import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiToken } from './api-token';

export type MpAuth = {
  /** 会话 token */
  token: string;
  /** 登录用户 id（账号密码登录时有值；全局 API Token 方式为 null） */
  userId: number | null;
};

/**
 * 小程序 API 鉴权，两种方式任选其一：
 * 1. 账号密码登录签发的会话 Token（mp_sessions 表，30 天有效）
 * 2. 全局 API Token（系统设置生成，system_configs.security/api_token）
 */
export async function requireMpToken(req: NextRequest): Promise<MpAuth> {
  const auth = req.headers.get('authorization');
  const qToken = new URL(req.url).searchParams.get('token');

  let token = '';
  if (auth && auth.startsWith('Bearer ')) {
    token = auth.substring(7);
  } else if (qToken) {
    token = qToken;
  }

  if (!token) {
    throw new Error('请先登录');
  }

  // 1. 优先查小程序会话
  try {
    const session = await prisma.mpSession.findUnique({
      where: { token },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (session) {
      if (new Date(session.expiresAt) < new Date()) {
        await prisma.mpSession.delete({ where: { id: session.id } }).catch(() => {});
        throw new Error('登录已过期，请重新登录');
      }
      return { token, userId: Number(session.userId) };
    }
  } catch (e: any) {
    if (e.message && e.message.includes('过期')) throw e;
    // 表不存在等异常 → 继续走全局 Token
  }

  // 2. 兜底：全局 API Token
  const valid = await getApiToken();
  if (valid && token === valid) {
    return { token, userId: null };
  }

  throw new Error('Token 无效，请重新登录');
}

export function mpErrorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : '未知错误';
  const isAuth = msg.includes('Token') || msg.includes('登录');
  return NextResponse.json({ success: false, error: msg }, { status: isAuth ? 401 : 500 });
}
