import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * POST /api/v1/mp/login - 小程序账号密码登录
 * body: { username, password }
 * 校验通过后签发 30 天会话 Token
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ success: false, error: '请输入账号和密码' }, { status: 400 });
    }

    const account = String(username).trim();

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: account },
          ...(account.includes('@') ? [{ email: account }] : []),
          { phone: account },
        ],
      },
      select: { id: true, username: true, realName: true, status: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: '账号或密码错误' }, { status: 401 });
    }
    if (user.status !== 1) {
      return NextResponse.json({ success: false, error: '账号已被禁用，请联系管理员' }, { status: 403 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: '账号或密码错误' }, { status: 401 });
    }

    // 签发会话 Token，30 天有效
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await prisma.mpSession.create({
      data: { token, userId: user.id, expiresAt },
    });

    return NextResponse.json({
      success: true,
      data: {
        token,
        expiresAt: expiresAt.toISOString(),
        user: { id: user.id.toString(), username: user.username, realName: user.realName },
      },
      message: '登录成功',
    });
  } catch (error: any) {
    // 表不存在等情况明确报错
    return NextResponse.json({ success: false, error: '登录服务异常，请稍后再试' }, { status: 500 });
  }
}
