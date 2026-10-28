import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * 单据附件（v1.3）
 * GET    /api/attachments?module=inbound&refId=12
 * POST   /api/attachments   { module, refId, url, fileName, mime, size }
 * DELETE /api/attachments?id=3
 *
 * 文件本身走 /api/upload（魔数校验 + 随机文件名），这里只存元数据与关联关系。
 */
const ALLOWED_MODULES = new Set(['inbound', 'outbound', 'purchase', 'transfer', 'stocktake']);

export async function GET(req: NextRequest) {
  await requireAuth(req);
  try {
    const sp = req.nextUrl.searchParams;
    const module = sp.get('module') || '';
    const refId = sp.get('refId');
    if (!module || !refId) {
      return NextResponse.json({ success: false, error: '缺少 module 或 refId' }, { status: 400 });
    }
    const items = await prisma.attachment.findMany({
      where: { module, refId: BigInt(refId) },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: items }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '附件查询失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const body = await req.json().catch(() => ({}));
    const module = String(body?.module || '');
    const refId = body?.refId;
    const url = String(body?.url || '');

    if (!ALLOWED_MODULES.has(module)) {
      return NextResponse.json({ success: false, error: '不支持的单据类型' }, { status: 400 });
    }
    if (!refId) return NextResponse.json({ success: false, error: '缺少单据 ID' }, { status: 400 });
    if (!url.startsWith('/uploads/')) {
      return NextResponse.json({ success: false, error: '附件地址非法' }, { status: 400 });
    }

    const count = await prisma.attachment.count({ where: { module, refId: BigInt(refId) } });
    if (count >= 20) {
      return NextResponse.json({ success: false, error: '每张单据最多 20 个附件' }, { status: 400 });
    }

    const row = await prisma.attachment.create({
      data: {
        module,
        refId: BigInt(refId),
        url,
        fileName: String(body?.fileName || 'attachment'),
        mime: body?.mime ? String(body.mime) : null,
        size: body?.size ? Number(body.size) : null,
        uploadedBy: uid ? (() => { try { return BigInt(uid); } catch { return null; } })() : null,
      },
    });

    await writeLog({
      module,
      action: 'attach',
      userId: uid,
      ip: getClientIp(),
      content: `上传附件 ${row.fileName}（${module}#${refId}）`,
      refType: 'attachment',
      refId: row.id,
    });

    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '附件保存失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: '缺少附件 ID' }, { status: 400 });

    const row = await prisma.attachment.delete({ where: { id: BigInt(id) } });
    await writeLog({
      module: row.module,
      action: 'detach',
      userId: uid,
      ip: getClientIp(),
      content: `删除附件 ${row.fileName}（${row.module}#${row.refId}）`,
      refType: 'attachment',
      refId: row.id,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '附件删除失败' }, { status: 500 });
  }
}
