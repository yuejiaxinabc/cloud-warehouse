import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { loadSmtpConfig, saveSmtpConfig, verifySmtp, sendMail, humanizeSmtpError, resolveSender } from '@/lib/mailer';
import { writeLog, getClientIp } from '@/lib/log';

/** 邮件配置（v1.2.0）——只有管理员可见/可改，密码返回时脱敏 */
async function assertAdmin(req: NextRequest) {
  const auth = await requireAuth(req);
  const roles = (auth as any)?.session?.user?.roles || [];
  return { auth, isAdmin: roles.includes('admin') };
}

export async function GET(req: NextRequest) {
  const { isAdmin } = await assertAdmin(req);
  if (!isAdmin) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

  const cfg = await loadSmtpConfig();
  if (!cfg) return NextResponse.json({ success: true, data: { configured: false } });

  // 让前端能显示「实际发件人」，避免只填显示名就以为配好了
  let effectiveFrom: string | null = null;
  try {
    effectiveFrom = resolveSender(cfg).header;
  } catch {
    effectiveFrom = null;
  }

  return NextResponse.json({
    success: true,
    data: {
      configured: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      // 有密码就返回占位符，前端不回填真实密码
      hasPassword: !!cfg.pass,
      from: cfg.from,
      effectiveFrom,
      enabled: cfg.enabled,
    },
  });
}

export async function POST(req: NextRequest) {
  const { auth, isAdmin } = await assertAdmin(req);
  if (!isAdmin) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const host = String(body?.host || '').trim();
    if (!host) return NextResponse.json({ success: false, error: 'SMTP 服务器地址必填' }, { status: 400 });

    const userInput = String(body?.user || '').trim();
    if (userInput && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userInput)) {
      return NextResponse.json({ success: false, error: '「发件账号」必须是完整邮箱，例如 notify@yourdomain.com' }, { status: 400 });
    }

    await saveSmtpConfig({
      host,
      port: Number(body?.port) || 465,
      secure: body?.secure !== false,
      user: String(body?.user || ''),
      pass: body?.pass ? String(body.pass) : undefined,
      from: String(body?.from || body?.user || ''),
      enabled: body?.enabled !== false,
    });

    await writeLog({
      module: 'settings',
      action: 'update',
      userId: (auth as any)?.session?.user?.id,
      ip: getClientIp(),
      content: `更新 SMTP 配置：${host}:${Number(body?.port) || 465}（${body?.secure !== false ? 'SSL' : 'STARTTLS/明文'}）`,
      refType: 'smtp',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: humanizeSmtpError(error.message) || '保存失败' }, { status: 500 });
  }
}

/** PUT：连通性测试。mode=verify 只握手；mode=send 真发一封测试邮件 */
export async function PUT(req: NextRequest) {
  const { isAdmin } = await assertAdmin(req);
  if (!isAdmin) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || 'verify');

    if (mode === 'verify') {
      await verifySmtp();
      const cfg = await loadSmtpConfig();
      const sender = cfg ? resolveSender(cfg) : null;
      return NextResponse.json({
        success: true,
        message: sender ? `SMTP 连接成功，发件人将是 ${sender.header}` : 'SMTP 连接成功',
      });
    }

    const to = String(body?.to || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ success: false, error: '收件人邮箱格式不正确' }, { status: 400 });
    }
    const res = await sendMail({
      to,
      subject: '【云仓】SMTP 配置测试',
      html: `<p>这是一封来自云仓仓储管理系统的测试邮件。</p>
             <p>收到它说明 SMTP 配置可用，报表订阅与告警邮件都能正常发送。</p>
             <p style="color:#94A3B8;font-size:12px">发送时间：${new Date().toLocaleString('zh-CN')}</p>`,
    });
    return NextResponse.json({ success: true, message: `测试邮件已发送（发件人 ${res.from}）`, data: res });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: humanizeSmtpError(error.message) || '测试失败' }, { status: 500 });
  }
}
