import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';
import { inboundPurchaseRequest } from '@/lib/purchase-inbound';

/**
 * 小程序购买申请（状态机与 Web 端一致：PENDING待采购 → PURCHASING已采购 → COMPLETED采购完成 → 入库）
 * GET   /api/v1/mp/purchase?id=1            详情
 * GET   /api/v1/mp/purchase?page=1&status=  列表
 * POST  /api/v1/mp/purchase                创建申请 { name, model?, color?, size?, quantity, remark? }
 * PATCH /api/v1/mp/purchase                状态流转 { id, action: 'purchase' | 'complete' }
 * PUT   /api/v1/mp/purchase                入库 { id, warehouseId, locationId, boxId, unitCost? }
 */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 15;

    if (id) {
      const request = await prisma.purchaseRequest.findUnique({
        where: { id: BigInt(id) },
        include: {
          warehouse: { select: { name: true, code: true } },
          location: { select: { name: true, code: true } },
          box: { select: { code: true } },
          inboundOrder: { select: { id: true, orderNo: true, status: true } },
        },
      });
      if (!request) return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
      return NextResponse.json(serializeBigInt({ success: true, data: request }));
    }

    const where: any = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { requestNo: { contains: keyword } },
        { name: { contains: keyword } },
        { model: { contains: keyword } },
        { applicant: { contains: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.purchaseRequest.findMany({
        where,
        include: {
          warehouse: { select: { name: true, code: true } },
          location: { select: { code: true } },
          box: { select: { code: true } },
          inboundOrder: { select: { orderNo: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.purchaseRequest.count({ where }),
    ]);

    return NextResponse.json(serializeBigInt({ success: true, data: { items, total, page, pageSize } }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMpToken(req);
    const body = await req.json();
    const { name, model, color, size, quantity, remark } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: '备件名称为必填' }, { status: 400 });
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return NextResponse.json({ success: false, error: '数量必须大于 0' }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const count = await prisma.purchaseRequest.count({ where: { requestNo: { startsWith: 'GQ' + dateStr } } });
    const requestNo = 'GQ' + dateStr + '-' + String(count + 1).padStart(4, '0');

    const user = auth.userId ? await prisma.user.findUnique({ where: { id: auth.userId }, select: { realName: true, username: true } }) : null;

    const request = await prisma.purchaseRequest.create({
      data: {
        requestNo,
        name: String(name).trim(),
        model: model ? String(model).trim() : null,
        color: color ? String(color).trim() : null,
        size: size ? String(size).trim() : null,
        quantity: qty,
        remark: remark || null,
        applicant: user?.realName || user?.username || null,
        applicantId: auth.userId,
      },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: { id: request.id.toString(), requestNo: request.requestNo },
      message: `申请已提交（${request.requestNo}）`,
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireMpToken(req);
    const body = await req.json();
    const { id, action } = body;
    if (!id) return NextResponse.json({ success: false, error: '缺少申请ID' }, { status: 400 });

    const existing = await prisma.purchaseRequest.findUnique({ where: { id: BigInt(id) } });
    if (!existing) return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });

    // 待采购 → 已采购
    if (action === 'purchase') {
      if (existing.status !== 'PENDING') {
        return NextResponse.json({ success: false, error: '只有待采购状态才能标记已采购' }, { status: 400 });
      }
      await prisma.purchaseRequest.update({ where: { id: existing.id }, data: { status: 'PURCHASING' } });
      return NextResponse.json({ success: true, message: '已标记为已采购' });
    }

    // 已采购 → 采购完成
    if (action === 'complete') {
      if (existing.status !== 'PURCHASING') {
        return NextResponse.json({ success: false, error: '只有已采购状态才能标记采购完成' }, { status: 400 });
      }
      await prisma.purchaseRequest.update({ where: { id: existing.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      return NextResponse.json({ success: true, message: '已标记为采购完成' });
    }

    return NextResponse.json({ success: false, error: '不支持的操作' }, { status: 400 });
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireMpToken(req);
    const body = await req.json();
    const { id, warehouseId, locationId, boxId, unitCost } = body;
    if (!id || !warehouseId || !locationId || !boxId) {
      return NextResponse.json({ success: false, error: '请选择仓库、货位和盒子' }, { status: 400 });
    }

    const request = await prisma.purchaseRequest.findUnique({ where: { id: BigInt(id) } });
    if (!request) return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    if (request.status !== 'COMPLETED') {
      return NextResponse.json({ success: false, error: '仅采购完成的申请可入库' }, { status: 400 });
    }
    if (request.inboundOrderId) {
      return NextResponse.json({ success: false, error: '该申请已入库，请勿重复操作' }, { status: 400 });
    }

    const { order } = await inboundPurchaseRequest(
      request,
      { warehouseId: Number(warehouseId), locationId: Number(locationId), boxId: Number(boxId), unitCost },
      auth.userId || undefined
    );

    await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: {
        warehouseId: BigInt(Number(warehouseId)),
        locationId: BigInt(Number(locationId)),
        boxId: BigInt(Number(boxId)),
        inboundOrderId: order.id,
      },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      message: `入库成功（入库单 ${order.orderNo}）`,
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
