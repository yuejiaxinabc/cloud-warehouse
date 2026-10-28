import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/** Webhook 订阅管理（v1.2.0） */
export async function GET(req: NextRequest) {
  await requireAuth(req);
  try {
    const items = await prisma.webhookEndpoint.findMany({ orderBy: { id: 'desc' } });
    return NextResponse.json(serializeBigInt({ success: true, data: items }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '查询失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const roles = (auth as any)?.session?.user?.roles || [];
    if (!roles.includes('admin')) return NextResponse.json({ success: false, error: '仅管理员可配置' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || '').trim();
    const url = String(body?.url || '').trim();
    if (!name || !url) return NextResponse.json({ success: false, error: '名称和回调地址必填' }, { status: 400 });
    if (!/^https?:\/\//.test(url)) return NextResponse.json({ success: false, error: '回调地址必须是 http(s)' }, { status: 400 });

    const row = await prisma.webhookEndpoint.create({
      data: {
        name,
        url,
        secret: body?.secret ? String(body.secret) : crypto.randomBytes(24).toString('hex'),
        events: String(body?.events || '*'),
        status: 1,
      },
    });

    await writeLog({
      module: 'system',
      action: 'create',
      userId: (auth as any)?.session?.user?.id,
      ip: getClientIp(),
      content: `新增 Webhook 订阅 ${name} → ${url}`,
      refType: 'webhook',
      refId: row.id,
    });

    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '创建失败' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name);
    if (body.url !== undefined) data.url = String(body.url);
    if (body.events !== undefined) data.events = String(body.events);
    if (body.status !== undefined) data.status = Number(body.status);
    const row = await prisma.webhookEndpoint.update({ where: { id: BigInt(body.id) }, data });
    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '更新失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await requireAuth(req);
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    await prisma.webhookEndpoint.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '删除失败' }, { status: 500 });
  }
}
