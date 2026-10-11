import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';

// GET - 购买申请列表
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

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
          warehouse: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true, code: true } },
          box: { select: { id: true, code: true } },
          inboundOrder: { select: { id: true, orderNo: true, status: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.purchaseRequest.count({ where }),
    ]);

    return NextResponse.json(serializeBigInt({ success: true, data: { items, total, page, pageSize } }));
  } catch (error: any) {
    return authErrorResponse(error);
  }
}

// POST - 提交购买申请（所有登录用户）
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const body = await req.json();
    const { name, model, color, size, quantity, remark, autoInbound, warehouseId, locationId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: '备件名称为必填' }, { status: 400 });
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return NextResponse.json({ success: false, error: '数量必须大于 0' }, { status: 400 });
    }

    // 生成申请单号：GQ + 日期 + 当日序号
    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const count = await prisma.purchaseRequest.count({
      where: { requestNo: { startsWith: 'GQ' + dateStr } },
    });
    const requestNo = 'GQ' + dateStr + '-' + String(count + 1).padStart(4, '0');

    const sessionUser = auth.type === 'session' ? (auth.session.user as any) : null;

    const request = await prisma.purchaseRequest.create({
      data: {
        requestNo,
        name: String(name).trim(),
        model: model ? String(model).trim() : null,
        color: color ? String(color).trim() : null,
        size: size ? String(size).trim() : null,
        quantity: qty,
        remark: remark || null,
        autoInbound: !!autoInbound,
        warehouseId: warehouseId ? Number(warehouseId) : null,
        locationId: locationId ? Number(locationId) : null,
        applicant: sessionUser?.name || sessionUser?.username || null,
        applicantId: sessionUser?.id ? Number(sessionUser.id) : null,
      },
    });

    return NextResponse.json(serializeBigInt({ success: true, data: request }));
  } catch (error: any) {
    return authErrorResponse(error);
  }
}
