import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';

// GET /api/logs?type=system|operation|inventory&page=1&pageSize=20&keyword=xxx
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = sp.get('type') || '';        // system / operation / inventory
    const page = parseInt(sp.get('page') || '1');
    const pageSize = parseInt(sp.get('pageSize') || '20');
    const keyword = sp.get('keyword') || '';
    const dateFrom = sp.get('dateFrom') || '';
    const dateTo = sp.get('dateTo') || '';

    const where: any = {};

    // 按类型过滤 module
    if (type === 'system') {
      where.module = { in: ['system', 'auth', 'user', 'role', 'settings'] };
    } else if (type === 'operation') {
      where.module = { in: ['product', 'warehouse', 'category', 'unit', 'supplier'] };
    } else if (type === 'inventory') {
      where.module = { in: ['stock-in', 'stock-out', 'transfer', 'stocktake', 'inventory'] };
    }

    if (keyword) {
      where.OR = [
        { content: { contains: keyword } },
        { action: { contains: keyword } },
        { module: { contains: keyword } },
      ];
    }

    if (dateFrom) {
      where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.createdAt = { ...where.createdAt, lte: new Date(dateTo + 'T23:59:59') };
    }

    const [items, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        include: { user: { select: { id: true, username: true, realName: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.operationLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: serializeBigInt({ items, total, page, pageSize }),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/logs — 写入日志（内部调用）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, module, action, refType, refId, content, ip } = body;

    const log = await prisma.operationLog.create({
      data: {
        userId: userId ? BigInt(userId) : null,
        module: module || 'system',
        action: action || 'unknown',
        refType: refType || null,
        refId: refId ? BigInt(refId) : null,
        content: content || null,
        ip: ip || null,
      },
    });

    return NextResponse.json({ success: true, data: serializeBigInt(log) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
