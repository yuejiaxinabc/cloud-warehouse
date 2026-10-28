import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * 回收站（v1.2.0）
 * GET  /api/trash?entity=product|supplier|customer|warehouse|category|unit
 * POST /api/trash  { entity, id }   —— 恢复
 * DELETE /api/trash?id=xx&entity=... —— 彻底删除（需管理员）
 *
 * 删除改为软删除（deletedAt），列表接口默认过滤，15 天后由人工/脚本彻底清理。
 */
const MODELS: Record<string, { model: any; nameField: string }> = {
  product: { model: (prisma as any).product, nameField: 'name' },
  supplier: { model: (prisma as any).supplier, nameField: 'name' },
  customer: { model: (prisma as any).customer, nameField: 'name' },
  warehouse: { model: (prisma as any).warehouse, nameField: 'name' },
  category: { model: (prisma as any).category, nameField: 'name' },
  unit: { model: (prisma as any).unit, nameField: 'name' },
};

export async function GET(req: NextRequest) {
  await requireAuth(req);
  try {
    const entity = req.nextUrl.searchParams.get('entity') || 'product';
    const conf = MODELS[entity];
    if (!conf) return NextResponse.json({ success: false, error: '不支持的实体' }, { status: 400 });

    const rows = await conf.model.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      take: 200,
    });

    const now = Date.now();
    const items = rows.map((r: any) => ({
      ...r,
      daysLeft: Math.max(0, 15 - Math.floor((now - new Date(r.deletedAt).getTime()) / 86400000)),
    }));

    return NextResponse.json(serializeBigInt({ success: true, data: items }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '回收站查询失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const body = await req.json().catch(() => ({}));
    const entity = String(body?.entity || '');
    const id = body?.id;
    const conf = MODELS[entity];
    if (!conf || !id) return NextResponse.json({ success: false, error: '参数不完整' }, { status: 400 });

    const row = await conf.model.update({ where: { id: BigInt(id) }, data: { deletedAt: null } });
    await writeLog({
      module: entity,
      action: 'restore',
      userId: uid,
      ip: getClientIp(),
      content: `从回收站恢复 ${entity}：${row[conf.nameField] || row.id}`,
      refType: entity,
      refId: row.id,
    });
    return NextResponse.json(serializeBigInt({ success: true, data: row }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '恢复失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const roles = (auth as any)?.session?.user?.roles || [];
    if (!roles.includes('admin')) {
      return NextResponse.json({ success: false, error: '仅管理员可彻底删除' }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const entity = sp.get('entity') || '';
    const id = sp.get('id');
    const conf = MODELS[entity];
    if (!conf || !id) return NextResponse.json({ success: false, error: '参数不完整' }, { status: 400 });

    await conf.model.delete({ where: { id: BigInt(id) } });
    await writeLog({
      module: entity,
      action: 'purge',
      userId: (auth as any)?.session?.user?.id,
      ip: getClientIp(),
      content: `彻底删除 ${entity} #${id}`,
      refType: entity,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '彻底删除失败，可能存在关联数据' }, { status: 400 });
  }
}
