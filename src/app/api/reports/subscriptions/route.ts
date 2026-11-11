import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import { ensureSystemTemplates, listTemplates } from '@/lib/mail-templates';

/**
 * 报表邮件订阅（v1.2.0 / v1.2.4 增加模板约束）
 *
 * v1.2.4 起，订阅必须绑定一个邮件模板：不允许"随便填段文字就订阅"。
 * 模板决定主题与正文，变量由发信时按白名单渲染。
 */

async function adminOnly(req: NextRequest, perm: string) {
  const auth = await requireAuth(req);
  await requirePermission(perm, auth);
  if (!auth.user.roles.includes('admin')) {
    const err: any = new Error('权限不足');
    err.statusCode = 403;
    throw err;
  }
  return auth;
}

async function assertTemplate(code: unknown) {
  const value = String(code || '').trim();
  if (!value) {
    const err: any = new Error('请选择邮件模板（订阅必须绑定模板）');
    err.statusCode = 400;
    throw err;
  }
  const tpl = await prisma.mailTemplate.findUnique({ where: { code: value } });
  if (!tpl || tpl.status !== 1) {
    const err: any = new Error('模板不存在或已停用：' + value);
    err.statusCode = 400;
    throw err;
  }
  return value;
}

export async function GET(req: NextRequest) {
  try {
    await adminOnly(req, 'report:view');
    await ensureSystemTemplates();
    const [items, templates] = await Promise.all([
      prisma.reportSubscription.findMany({ orderBy: { id: 'asc' } }),
      listTemplates(),
    ]);
    const nameByCode = new Map(templates.map((t) => [t.code, t.name]));
    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        items: items.map((s) => ({
          ...s,
          templateName: s.templateCode ? (nameByCode.get(s.templateCode) || s.templateCode) : '未绑定模板',
        })),
        templates,
      },
    }));
  } catch (error) { return handleApiError(error); }
}

export async function POST(req: NextRequest) {
  try {
    await adminOnly(req, 'report:manage');
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim() || '库存报表订阅';
    const type = String(body?.type || 'daily');
    const recipients = String(body?.recipients || '').trim();
    const templateCode = await assertTemplate(body?.templateCode);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+(,\s*[^@\s]+@[^@\s]+\.[^@\s]+)*$/.test(recipients)) {
      return NextResponse.json({ success: false, error: '收件人格式不正确（多个用英文逗号分隔）' }, { status: 400 });
    }
    const row = await prisma.reportSubscription.create({
      data: {
        name,
        type,
        recipients,
        templateCode,
        sendHour: Math.min(23, Math.max(0, Number(body?.sendHour ?? 8))),
        weekday: body?.weekday ? Number(body.weekday) : null,
        enabled: body?.enabled === false ? 0 : 1,
      },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await adminOnly(req, 'report:manage');
    const body = await req.json().catch(() => ({}));
    if (!body?.id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.type !== undefined) data.type = String(body.type);
    if (body.recipients !== undefined) data.recipients = String(body.recipients);
    if (body.sendHour !== undefined) data.sendHour = Number(body.sendHour);
    if (body.weekday !== undefined) data.weekday = body.weekday ? Number(body.weekday) : null;
    if (body.enabled !== undefined) data.enabled = body.enabled ? 1 : 0;
    if (body.templateCode !== undefined) data.templateCode = await assertTemplate(body.templateCode);
    const row = await prisma.reportSubscription.update({ where: { id: BigInt(body.id) }, data });
    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await adminOnly(req, 'report:manage');
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    await prisma.reportSubscription.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error); }
}
