import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';

/** 报表邮件订阅（v1.2.0）*/
export async function GET(req: NextRequest) {
  await requireAuth(req);
  const items = await prisma.reportSubscription.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json(serializeBigInt({ success: true, data: items }));
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  const roles = (auth as any)?.session?.user?.roles || [];
  if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim() || '库存报表订阅';
    const type = String(body?.type || 'daily');
    const recipients = String(body?.recipients || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+(,\s*[^@\s]+@[^@\s]+\.[^@\s]+)*$/.test(recipients)) {
      return NextResponse.json({ success: false, error: '收件人格式不正确（多个用英文逗号分隔）' }, { status: 400 });
    }
    const row = await prisma.reportSubscription.create({
      data: {
        name,
        type,
        recipients,
        sendHour: Math.min(23, Math.max(0, Number(body?.sendHour ?? 8))),
        weekday: body?.weekday ? Number(body.weekday) : null,
        enabled: body?.enabled === false ? 0 : 1,
      },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '创建失败' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  const roles = (auth as any)?.session?.user?.roles || [];
  if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.type !== undefined) data.type = String(body.type);
    if (body.recipients !== undefined) data.recipients = String(body.recipients);
    if (body.sendHour !== undefined) data.sendHour = Number(body.sendHour);
    if (body.weekday !== undefined) data.weekday = body.weekday ? Number(body.weekday) : null;
    if (body.enabled !== undefined) data.enabled = body.enabled ? 1 : 0;
    const row = await prisma.reportSubscription.update({ where: { id: BigInt(body.id) }, data });
    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '更新失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  const roles = (auth as any)?.session?.user?.roles || [];
  if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '权限不足' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
  await prisma.reportSubscription.delete({ where: { id: BigInt(id) } });
  return NextResponse.json({ success: true });
}
