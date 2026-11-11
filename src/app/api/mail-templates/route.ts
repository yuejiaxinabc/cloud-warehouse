import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import {
  ALLOWED_VARIABLES, SYSTEM_TEMPLATES, ensureSystemTemplates, findUnknownVariables, listTemplates,
} from '@/lib/mail-templates';
import { writeLog, getClientIp } from '@/lib/log';

/** 邮件模板（v1.2.4）：仅管理员可维护；订阅只能从这里选模板 */
async function requireAdminUser(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.user.roles.includes('admin')) {
    const err: any = new Error('权限不足');
    err.statusCode = 403;
    throw err;
  }
  return auth;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser(req);
    await ensureSystemTemplates();
    const [items, full] = await Promise.all([
      listTemplates(),
      prisma.mailTemplate.findMany({ orderBy: [{ isSystem: 'desc' }, { id: 'asc' }] }),
    ]);
    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        items,
        all: full.map((t) => ({
          id: Number(t.id), code: t.code, name: t.name, subject: t.subject,
          bodyHtml: t.bodyHtml, variables: t.variables, isSystem: t.isSystem, status: t.status,
        })),
        allowedVariables: ALLOWED_VARIABLES,
      },
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUser(req);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '').trim();
    const name = String(body.name || '').trim();
    const subject = String(body.subject || '').trim();
    const bodyHtml = String(body.bodyHtml || '').trim();
    if (!/^[a-z][a-z0-9_]{2,49}$/.test(code)) {
      return NextResponse.json({ success: false, error: '模板编码需小写字母开头、3-50 位（小写字母/数字/下划线）' }, { status: 400 });
    }
    if (!name || !subject || !bodyHtml) {
      return NextResponse.json({ success: false, error: '模板名称、邮件主题、正文都不能为空' }, { status: 400 });
    }
    const unknown = findUnknownVariables(subject + bodyHtml);
    if (unknown.length) {
      return NextResponse.json({ success: false, error: '模板里有不支持的变量：' + unknown.join('、') + '；可用变量见页面提示' }, { status: 400 });
    }
    const dup = await prisma.mailTemplate.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ success: false, error: '模板编码已存在' }, { status: 400 });

    const row = await prisma.mailTemplate.create({
      data: { code, name, subject, bodyHtml, variables: ALLOWED_VARIABLES.join(','), isSystem: false, status: 1 },
    });
    await writeLog({ module: 'settings', action: 'mail_template_create', ip: getClientIp(), content: '新建邮件模板 ' + name + '（' + code + '）' });
    return NextResponse.json(serializeBigInt({ success: true, data: { id: Number(row.id) } }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUser(req);
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id || 0);
    if (!id) return NextResponse.json({ success: false, error: '缺少模板 id' }, { status: 400 });
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.subject !== undefined) data.subject = String(body.subject).trim();
    if (body.bodyHtml !== undefined) data.bodyHtml = String(body.bodyHtml);
    if (body.status !== undefined) data.status = Number(body.status) === 0 ? 0 : 1;
    const unknown = findUnknownVariables(String(data.subject || '') + String(data.bodyHtml || ''));
    if (unknown.length) {
      return NextResponse.json({ success: false, error: '模板里有不支持的变量：' + unknown.join('、') }, { status: 400 });
    }
    await prisma.mailTemplate.update({ where: { id: BigInt(id) }, data });
    await writeLog({ module: 'settings', action: 'mail_template_update', ip: getClientIp(), content: '更新邮件模板 #' + id });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUser(req);
    const id = Number(new URL(req.url).searchParams.get('id') || 0);
    if (!id) return NextResponse.json({ success: false, error: '缺少模板 id' }, { status: 400 });
    const tpl = await prisma.mailTemplate.findUnique({ where: { id: BigInt(id) } });
    if (!tpl) return NextResponse.json({ success: false, error: '模板不存在' }, { status: 404 });
    if (tpl.isSystem) return NextResponse.json({ success: false, error: '系统内置模板不可删除，可以改内容或停用' }, { status: 400 });
    const used = await prisma.reportSubscription.count({ where: { templateCode: tpl.code } });
    if (used > 0) return NextResponse.json({ success: false, error: '还有 ' + used + ' 个订阅在用这个模板，请先改绑' }, { status: 400 });
    await prisma.mailTemplate.delete({ where: { id: BigInt(id) } });
    await writeLog({ module: 'settings', action: 'mail_template_delete', ip: getClientIp(), content: '删除邮件模板 ' + tpl.name });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
