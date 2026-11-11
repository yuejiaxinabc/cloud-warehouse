import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requirePermission } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

/**
 * 登录日志查询（v1.2.3）
 *
 * GET /api/login-logs?page=1&pageSize=20&username=xxx&action=login&success=true&dateFrom=2026-01-01&dateTo=2026-01-31
 *
 * 数据来源 login_logs（由 src/lib/auth.ts 的 writeLoginLog 写入），与 operation_logs 分离：
 *  - username 模糊匹配；
 *  - action 只接受白名单（login/logout/failed/locked/2fa_failed），避免拿任意串去打索引外的列；
 *  - dateFrom / dateTo 为 YYYY-MM-DD，按自然日闭区间处理；
 *  - 权限码 audit:view（与 /api/logs、/api/audit-logs 一致，logs 页现在就是这么拦的）。
 */

/** 动作白名单，与 auth.ts 写入侧保持同步 */
const ACTION_WHITELIST = ['login', 'logout', 'failed', 'locked', '2fa_failed'];

/** 解析 YYYY-MM-DD；非法值返回 null（不报错，等同于不筛选） */
function parseDay(value: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + (endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: NextRequest) {
  try {
    // 登录日志含他人账号与 IP，只对管理面/审计角色开放
    await requirePermission('audit:view');

    const sp = req.nextUrl.searchParams;

    // ---- 分页（默认 1 / 20）----
    const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(sp.get('pageSize') || '20', 10) || 20));

    // ---- 筛选条件 ----
    const username = (sp.get('username') || '').trim();
    const action = (sp.get('action') || '').trim();
    const successRaw = (sp.get('success') || '').trim().toLowerCase();
    const dateFrom = (sp.get('dateFrom') || '').trim();
    const dateTo = (sp.get('dateTo') || '').trim();

    const where: any = {};
    if (username) where.username = { contains: username };
    if (action && ACTION_WHITELIST.includes(action)) where.action = action;

    if (['true', '1', 'success'].includes(successRaw)) where.success = true;
    else if (['false', '0', 'failed'].includes(successRaw)) where.success = false;

    const createdAt: any = {};
    const from = parseDay(dateFrom);
    const to = parseDay(dateTo, true);
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;

    // ---- 今日概览：总数 / 失败数 / 去重账号数（服务器本地零点起算）----
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [items, total, todayTotal, todayFailed, todayUsers] = await Promise.all([
      prisma.loginLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.loginLog.count({ where }),
      prisma.loginLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.loginLog.count({ where: { createdAt: { gte: todayStart }, success: false } }),
      prisma.loginLog.findMany({
        where: { createdAt: { gte: todayStart } },
        select: { username: true },
        distinct: ['username'],
      }),
    ]);

    // BigInt 一律转 Number，避免 JSON 序列化抛错
    const formatted = items.map((item) => ({
      id: Number(item.id),
      userId: item.userId === null || item.userId === undefined ? null : Number(item.userId),
      username: item.username,
      action: item.action,
      success: item.success,
      reason: item.reason,
      ip: item.ip,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
    }));

    return NextResponse.json({
      success: true,
      data: serializeBigInt({
        items: formatted,
        total,
        page,
        pageSize,
        stats: {
          todayTotal,
          todayFailed,
          uniqueUsers: todayUsers.length,
        },
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
