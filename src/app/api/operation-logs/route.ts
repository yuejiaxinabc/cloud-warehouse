import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    // P1-8：原来只判「已登录」，任意账号可读全站操作日志（含 IP）；改为审计权限
    await requirePermission('audit:view');

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
    return handleApiError(e);
  }
}
