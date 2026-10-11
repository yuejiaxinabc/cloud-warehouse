import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';

// GET - 申请详情（所有登录用户）
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
    const request = await prisma.purchaseRequest.findUnique({
      where: { id: BigInt(params.id) },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
        box: { select: { id: true, code: true } },
        inboundOrder: { select: { id: true, orderNo: true, status: true } },
      },
    });
    if (!request) {
      return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    }
    return NextResponse.json(serializeBigInt({ success: true, data: request }));
  } catch (error: any) {
    return authErrorResponse(error);
  }
}

// PATCH - 修改申请 / 状态流转（所有登录用户）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
    const id = BigInt(params.id);
    const body = await req.json();
    const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    }

    // 标记已采购：待采购 → 已采购(PURCHASING)
    if (body.action === 'purchase') {
      if (existing.status !== 'PENDING') {
        return NextResponse.json({ success: false, error: '只有待采购状态才能标记已采购' }, { status: 400 });
      }
      const updated = await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'PURCHASING' },
      });
      return NextResponse.json(serializeBigInt({ success: true, data: updated }));
    }

    // 采购完成：已采购(PURCHASING) → 采购完成(COMPLETED)
    if (body.action === 'complete') {
      if (existing.status !== 'PURCHASING') {
        return NextResponse.json({ success: false, error: '只有已采购状态才能标记采购完成' }, { status: 400 });
      }
      const updated = await prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      return NextResponse.json(serializeBigInt({ success: true, data: updated }));
    }

    // 字段修改（已采购后不允许改）
    if (existing.status === 'COMPLETED') {
      return NextResponse.json({ success: false, error: '已采购的申请不可修改' }, { status: 400 });
    }
    const data: any = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.model !== undefined) data.model = body.model ? String(body.model).trim() : null;
    if (body.color !== undefined) data.color = body.color ? String(body.color).trim() : null;
    if (body.size !== undefined) data.size = body.size ? String(body.size).trim() : null;
    if (body.quantity !== undefined) {
      const qty = Number(body.quantity);
      if (!qty || qty <= 0) {
        return NextResponse.json({ success: false, error: '数量必须大于 0' }, { status: 400 });
      }
      data.quantity = qty;
    }
    if (body.remark !== undefined) data.remark = body.remark || null;

    const updated = await prisma.purchaseRequest.update({ where: { id }, data });
    return NextResponse.json(serializeBigInt({ success: true, data: updated }));
  } catch (error: any) {
    return authErrorResponse(error);
  }
}

// DELETE - 删除申请（所有登录用户，任何状态可删）
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
    const id = BigInt(params.id);
    const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: '申请不存在' }, { status: 404 });
    }
    await prisma.purchaseRequest.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return authErrorResponse(error);
  }
}
