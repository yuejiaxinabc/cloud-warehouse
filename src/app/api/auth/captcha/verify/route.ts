import { NextRequest, NextResponse } from 'next/server';
import { checkCaptcha } from '@/lib/captcha-store';
import { hit, clientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/captcha/verify
 *
 * v1.1.1：只做「验证码对不对」的预检，不消费票据。
 * 目的是让登录页能给出「验证码错误 / 已过期」这种精确提示，
 * 而不是把验证码错误也笼统显示成「账号或密码错误」。
 *
 * 消费仍然只在 NextAuth 的 authorize() 里发生 —— 绕过前端直接打 callback
 * 依旧拿不到登录能力，安全性不受影响。
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    const limited = await hit(`captcha-verify:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json({ success: false, error: '验证过于频繁，请稍后再试' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || '');
    const answer = String(body?.answer || '');

    const res = checkCaptcha(token, answer);
    return NextResponse.json({ success: res.ok, error: res.error || null });
  } catch {
    return NextResponse.json({ success: false, error: '验证码校验失败，请刷新重试' }, { status: 500 });
  }
}
