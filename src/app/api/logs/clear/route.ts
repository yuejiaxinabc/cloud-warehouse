import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { handleApiError, errorResponse, successResponse } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * 清空审计日志（v1.2.4）
 *
 * 日志会越积越多，管理员需要能清理；但这一步不可逆，所以：
 *   1) 仅管理员可调用（requireAdmin）；
 *   2) 必须显式传 confirm="清空日志"，前端还会要求手输确认词；
 *   3) 支持按页签范围清理（系统/操作/库存/登录/全部）；
 *   4) 清空动作本身写一条系统日志：谁、什么时候、清了多少条、清了哪个范围 —— 这条不会被自己删掉。
 */

const SCOPES: Record<string, string[]> = {
  system: ['system', 'auth', 'user', 'role', 'settings'],
  operation: ['product', 'warehouse', 'category', 'unit', 'supplier'],
  inventory: ['stock-in', 'stock-out', 'transfer', 'stocktake', 'inventory'],
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const scope = String(body?.scope || '');
    const confirm = String(body?.confirm || '').trim();

    if (confirm !== '清空日志') {
      return errorResponse('请先输入确认词「清空日志」', 400);
    }
    if (!['system', 'operation', 'inventory', 'login', 'all'].includes(scope)) {
      return errorResponse('未知的清理范围', 400);
    }

    const actorId = Number((session.user as any)?.id) || undefined;
    const actorName = (session.user as any)?.name || (session.user as any)?.username || '';
    let removed = 0;

    if (scope === 'login') {
      removed = (await prisma.loginLog.deleteMany({})).count;
    } else if (scope === 'all') {
      const opCount = (await prisma.operationLog.deleteMany({})).count;
      const loginCount = (await prisma.loginLog.deleteMany({})).count;
      removed = opCount + loginCount;
    } else {
      removed = (await prisma.operationLog.deleteMany({
        where: { module: { in: SCOPES[scope] } },
      })).count;
    }

    const scopeLabel = scope === 'login' ? '登录日志' : scope === 'all' ? '全部日志'
      : scope === 'system' ? '系统日志' : scope === 'operation' ? '操作日志' : '库存日志';

    // 清空动作本身必须留痕，且这条日志是在删除之后写入，不会被自己清掉
    await writeLog({
      module: 'system',
      action: 'logs_clear',
      userId: actorId,
      ip: getClientIp(),
      content: '清空' + scopeLabel + ' ' + removed + ' 条（操作人：' + (actorName || '未知') + '）',
      refType: 'log',
    });

    return successResponse(
      { removed, scope, scopeLabel, clearedAt: new Date().toISOString(), actorName },
      '已清空' + scopeLabel + ' ' + removed + ' 条',
    );
  } catch (error) {
    return handleApiError(error);
  }
}
