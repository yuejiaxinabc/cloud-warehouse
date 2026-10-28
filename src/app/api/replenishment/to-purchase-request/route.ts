import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * POST /api/replenishment/to-purchase-request
 * body: { items: [{ productId, name, quantity, warehouseId? }] }
 *
 * v1.2 闭环：补货建议 → 购买申请（复用已有 purchase_requests 模块），
 * 已存在同名 PENDING 申请的不重复建单。
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const body = await req.json().catch(() => ({}));
    const items: any[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ success: false, error: '请至少选择一条补货建议' }, { status: 400 });
    }
    if (items.length > 200) {
      return NextResponse.json({ success: false, error: '一次最多生成 200 条申请' }, { status: 400 });
    }

    const today = new Date();
    const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const prefix = `PR-${ymd}-`;

    const existing = await prisma.purchaseRequest.findMany({
      where: { requestNo: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      take: 1,
    });
    let seq = existing.length ? parseInt(existing[0].requestNo.slice(prefix.length), 10) || 0 : 0;

    const created: string[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      const name = String(item?.name || '').trim();
      const quantity = Number(item?.quantity);
      if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

      // 同名 + 同仓库 + 待采购 → 不重复建单
      const dup = await prisma.purchaseRequest.findFirst({
        where: {
          name,
          status: 'PENDING',
          ...(item?.warehouseId ? { warehouseId: BigInt(item.warehouseId) } : {}),
        },
      });
      if (dup) { skipped.push(name); continue; }

      seq += 1;
      const requestNo = prefix + String(seq).padStart(3, '0');
      await prisma.purchaseRequest.create({
        data: {
          requestNo,
          name,
          model: item?.model || null,
          quantity,
          status: 'PENDING',
          warehouseId: item?.warehouseId ? BigInt(item.warehouseId) : null,
          applicant: (auth as any)?.session?.user?.name || null,
          applicantId: uid ? (() => { try { return BigInt(uid); } catch { return null; } })() : null,
          remark: item?.remark || `由补货建议生成（可用 ${item?.available ?? '-'} / 安全库存 ${item?.safetyStock ?? '-'}）`,
        },
      });
      created.push(requestNo);
    }

    await writeLog({
      module: 'purchase',
      action: 'create',
      userId: uid,
      ip: getClientIp(),
      content: `由补货建议生成购买申请 ${created.length} 条${skipped.length ? `，跳过 ${skipped.length} 条（已存在待办）` : ''}`,
      refType: 'purchase_request',
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: { created, skipped, createdCount: created.length, skippedCount: skipped.length },
    }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '生成购买申请失败' }, { status: 500 });
  }
}
