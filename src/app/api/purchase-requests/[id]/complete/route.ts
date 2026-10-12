import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { inboundPurchaseRequest } from '@/lib/purchase-inbound';

/**
 * POST /api/purchase-requests/[id]/complete
 * 管理员标记购买完成。
 * body: { inbound: boolean, warehouseId?, locationId?, boxId?, unitCost? }
 * - inbound=true：完成的同时直接入库（自动创建/匹配商品 → 生成采购入库单并过账 → 写入库位库存）
 * - inbound=false：仅标记完成，后续可通过「入库」操作手动入库（支持选库位）
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    const operatorId = auth.type === 'session'
      ? (Number((auth.session.user as any).id) || undefined)
      : (auth.userId || undefined);
    const id = BigInt((await params).id);
    const body = await req.json();
    const { inbound, warehouseId, locationId, boxId, unitCost } = body;

    const request = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!request) {
      return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    }
    // 流转顺序：提交(PENDING) → 购买中(PURCHASING) → 购买完成(COMPLETED) → 入库
    if (request.status !== 'PURCHASING') {
      return NextResponse.json({ success: false, error: '只有采购中的申请才能标记购买完成' }, { status: 400 });
    }

    if (!inbound) {
      // 仅标记完成
      const updated = await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return NextResponse.json(serializeBigInt({ success: true, data: updated, message: '已标记购买完成' }));
    }

    // ===== 完成并直接入库 =====
    if (!warehouseId || !locationId) {
      return NextResponse.json({ success: false, error: '直接入库需要选择仓库和库位' }, { status: 400 });
    }

    const { order } = await inboundPurchaseRequest(
      request,
      { warehouseId: Number(warehouseId), locationId: Number(locationId), boxId: boxId ? Number(boxId) : null, unitCost },
      operatorId
    );

    // 更新申请状态
    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        warehouseId: BigInt(Number(warehouseId)),
        locationId: BigInt(Number(locationId)),
        inboundOrderId: order.id,
      },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: updated,
      message: `购买完成，已入库（入库单 ${order.orderNo}）`,
    }));
  } catch (error: any) {
    return authErrorResponse(error);
  }
}
