import { prisma } from '@/lib/prisma';
import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest } from 'next/server';
import { StockOutService } from '@/services/stock-out.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { z } from 'zod';

// v1.2.1：原来 approved 是必填 boolean，前端不传或传字符串就抛 ZodError，
// 再被 handleApiError 兜底成 500「服务器内部错误」，审批链因此完全不可用。
// 现在缺省 true（「审批通过」是主路径），并兼容 "true"/1 之类的宽松输入。
const approveSchema = z.object({
  approved: z
    .union([z.boolean(), z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined) return true;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      return ['false', '0', 'no', 'reject'].indexOf(v.toLowerCase()) === -1;
    }),
  remark: z.string().max(500).optional(),
});

/**
 * POST /api/stock-out/[id]/approve - 审批出库单
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stock_out:approve', auth);
    // v1.2.1：按权限闸门拦截（P0-1）

    const { id } = idSchema.parse({ id: params.id });
    const scopeOrder = await prisma.outboundOrder.findUnique({ where: { id } });
    if (!scopeOrder) return errorResponse('单据不存在', 404);
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, scopeOrder, { transfer: false });
    // 空请求体也允许（默认视为审批通过）
    const body = await request.json().catch(() => ({}));
    const { approved, remark } = approveSchema.parse(body);

    const approverId = Number(auth.user.id);
    const result = await StockOutService.approve(id, approved, approverId, remark);

    return successResponse(result, approved ? '审批通过' : '审批拒绝');
  } catch (error) {
    return handleApiError(error);
  }
}
