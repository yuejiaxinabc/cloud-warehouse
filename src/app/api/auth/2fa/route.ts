import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { generateSecret, verifyTotp, otpauthUrl } from '@/lib/totp';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * 两步验证（TOTP）
 * POST   /api/auth/2fa  { action: 'setup' | 'enable' | 'disable', code? }
 * GET    /api/auth/2fa  —— 查询当前状态
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    if (!uid) return NextResponse.json({ success: true, data: { enabled: false } });
    const user = await prisma.user.findUnique({ where: { id: BigInt(uid) }, select: { twoFactorEnabled: true } });
    return NextResponse.json({ success: true, data: { enabled: !!user?.twoFactorEnabled } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const username = (auth as any)?.session?.user?.username || 'user';
    if (!uid) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');

    if (action === 'setup') {
      const secret = generateSecret();
      await prisma.user.update({ where: { id: BigInt(uid) }, data: { totpSecret: secret, twoFactorEnabled: false } });
      return NextResponse.json({
        success: true,
        data: { secret, otpauth: otpauthUrl(secret, username) },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: BigInt(uid) }, select: { totpSecret: true } });

    if (action === 'enable') {
      if (!user?.totpSecret) return NextResponse.json({ success: false, error: '请先生成密钥' }, { status: 400 });
      if (!verifyTotp(user.totpSecret, String(body?.code || ''))) {
        return NextResponse.json({ success: false, error: '验证码不正确（注意是 6 位数字）' }, { status: 400 });
      }
      await prisma.user.update({ where: { id: BigInt(uid) }, data: { twoFactorEnabled: true } });
      await writeLog({
        module: 'auth', action: '2fa_enable', userId: uid, ip: getClientIp(),
        content: `开启两步验证（${username}）`, refType: 'user', refId: uid,
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'disable') {
      if (user?.totpSecret && !verifyTotp(user.totpSecret, String(body?.code || ''))) {
        return NextResponse.json({ success: false, error: '请输入当前动态验证码以关闭' }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: BigInt(uid) },
        data: { twoFactorEnabled: false, totpSecret: null },
      });
      await writeLog({
        module: 'auth', action: '2fa_disable', userId: uid, ip: getClientIp(),
        content: `关闭两步验证（${username}）`, refType: 'user', refId: uid,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '操作失败' }, { status: 500 });
  }
}
