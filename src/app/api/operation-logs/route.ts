import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType') || '';
    const action = searchParams.get('action') || '';
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const where: any = {};
    if (entityType) where.module = entityType;
    if (action) where.action = action;
    if (keyword) {
      where.OR = [
        { content: { contains: keyword } },
        { refType: { contains: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        include: {
          user: { select: { id: true, realName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.operationLog.count({ where }),
    ]);

    const formatted = items.map((log) => ({
      id: log.id.toString(),
      action: log.action,
      entityType: log.module,
      entityId: log.refId?.toString() || null,
      content: log.content,
      ipAddress: log.ip,
      createdAt: log.createdAt,
      user: log.user ? { realName: log.user.realName, username: log.user.username } : null,
    }));

    return NextResponse.json({ success: true, data: { items: formatted, total } });
  } catch (e: any) {
    console.error('GET /api/operation-logs error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
