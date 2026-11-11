import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireLogin, requirePermission } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';

/** Webhook 订阅管理（v1.2.0） */
export async function GET(req: NextRequest) {
  try {
    // 读面：登录即可查看（订阅地址含 secret 由 POST 返回，不在列表里）
    await requireLogin();
    const items = await prisma.webhookEndpoint.findMany({ orderBy: { id: 'desc' } });
    return NextResponse.json(serializeBigInt({ success: true, data: items }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // P0-1：Webhook 会把业务数据外发，只有管理面（system 权限）可配置
    const session = await requirePermission('system');
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
      userId: (session as any)?.user?.id,
      ip: getClientIp(),
      content: `新增 Webhook 订阅 ${name} → ${url}`,
      refType: 'webhook',
      refId: row.id,
    });

    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    // P0-1：原来只判登录，普通账号可改回调地址（把数据导到自己的服务器），补管理面鉴权
    await requirePermission('system');
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
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requirePermission('system');
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少 ID' }, { status: 400 });
    await prisma.webhookEndpoint.delete({ where: { id: BigInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return handleApiError(error);
  }
}
