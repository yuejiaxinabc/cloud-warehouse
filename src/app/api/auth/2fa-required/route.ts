import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hit, clientIp } from '@/lib/rate-limit';

/**
 * 登录页按需展示两步验证（GET /api/auth/2fa-required?username=xxx）
 *
 * 目的：没开两步验证的账号不该在登录页看到那个输入框。
 *
 * 信息面控制：
 *  - 只回答 true / false，不返回任何账号资料；
 *  - 账号不存在、已停用、未开启 2FA 一律返回 false（与"未开启"不可区分）；
 *  - 固定 250ms 延迟抹平时序差异，避免用响应快慢反推账号存在性；
 *  - 按 IP 限流 30 次/分钟，正常用户手打账号远低于此；
 *  - 真正的二次验证仍由 authorize() 强制校验，本接口只影响界面显隐。
 */

const WINDOW_MS = 60 * 1000;
const IP_LIMIT = 30;
const FIXED_DELAY_MS = 250;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => { headers[key] = value; });
  const ip = clientIp(headers);

  try {
    const gate = await hit('2fa-hint:' + ip, IP_LIMIT, WINDOW_MS);
    if (!gate.allowed) {
      await wait(FIXED_DELAY_MS);
      return NextResponse.json(
        { success: false, data: { required: false } },
        { status: 429, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const raw = (req.nextUrl.searchParams.get('username') || '').trim().slice(0, 100);
    let required = false;
    if (raw) {
      const user = await prisma.user.findFirst({
        where: {
          status: 1,
          OR: [{ username: raw }, { email: raw }, { phone: raw }],
        },
        select: { twoFactorEnabled: true },
      });
      required = !!user?.twoFactorEnabled;
    }

    await wait(FIXED_DELAY_MS);
    return NextResponse.json(
      { success: true, data: { required } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    await wait(FIXED_DELAY_MS);
    return NextResponse.json(
      { success: false, data: { required: false } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
