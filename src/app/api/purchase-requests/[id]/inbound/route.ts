import { businessAccess, assertWarehouseAllowed } from '@/app/api/warehouse/access';
import { withDocumentScope, assertDocumentAllowed } from '@/lib/data-scope';
import { handleApiError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { inboundPurchaseRequest } from '@/lib/purchase-inbound';

/**
 * POST /api/purchase-requests/[id]/inbound
 * 已完成（未入库）的购买申请手动入库，支持选择仓库/库位。
 * body: { warehouseId, locationId, boxId?, unitCost? }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { scope, user } = await businessAccess('stock_in:create');
    const operatorId = user.id;
    const id = BigInt(params.id);
    const body = await req.json();
    const { warehouseId, locationId, boxId, unitCost } = body;

    if (!warehouseId || !locationId) {
      return NextResponse.json({ success: false, error: '请选择仓库和货位' }, { status: 400 });
    }

    const request = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!request) {
      return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    }
    await assertDocumentAllowed(scope, user, { ...request, operatorId: request.applicantId });
    if (warehouseId) await assertWarehouseAllowed(scope, Number(warehouseId));
    if (request.status !== 'COMPLETED') {
      return NextResponse.json({ success: false, error: '仅购买完成的申请可入库' }, { status: 400 });
    }
    if (request.inboundOrderId) {
      return NextResponse.json({ success: false, error: '该申请已入库，请勿重复操作' }, { status: 400 });
    }

    const { order } = await inboundPurchaseRequest(
      request,
      { warehouseId: Number(warehouseId), locationId: Number(locationId), boxId: Number(boxId), unitCost },
      operatorId
    );

    const updated = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        warehouseId: BigInt(Number(warehouseId)),
        locationId: BigInt(Number(locationId)),
        boxId: boxId ? BigInt(Number(boxId)) : null,
        inboundOrderId: order.id,
      },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: updated,
      message: `入库成功（入库单 ${order.orderNo}）`,
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}
