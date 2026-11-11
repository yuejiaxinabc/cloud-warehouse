import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { handleApiError, errorResponse, successResponse, AppError } from '@/lib/errors';
import { getSessionChecked, requirePermission } from '@/lib/auth-guard';
import { sanitizeText } from '@/lib/sanitize';

/** v1.2.4 B：批量字段同样要过上限（数量类 <= 1,000,000、最多 3 位小数）与去标签 */
const MAX_BATCH_QTY = 1_000_000;

/**
 * 批量修改商品字段（v1.2.1 收紧）
 *
 * 原实现直接把请求体里的 field 透传给 Prisma（data: { [field]: value }），
 * 任意登录账号即可批量改任意列（含 deletedAt 软删、id、价格表关联字段），
 * 且错误会回显 Product 全字段。现在：
 *  1) 必须登录；2) 只允许白名单里的列；3) 值按列做类型收敛；4) 错误统一走 handleApiError。
 */
const ALLOWED_FIELDS: Record<string, 'int' | 'decimal' | 'string'> = {
  status: 'int',
  categoryId: 'int',
  unitId: 'int',
  safetyStock: 'decimal',
  maxStock: 'decimal',
  shelfLifeDays: 'int',
  leadTimeDays: 'int',
  costMethod: 'string',
  brand: 'string',
  spec: 'string',
  model: 'string',
};

function coerce(field: string, raw: unknown) {
  const kind = ALLOWED_FIELDS[field];
  if (kind === 'int') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new AppError(`字段 ${field} 需要非负整数`, 400);
    if (n > MAX_BATCH_QTY) throw new AppError(`字段 ${field} 不能超过 ${MAX_BATCH_QTY}`, 400);
    return n;
  }
  if (kind === 'decimal') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new AppError(`字段 ${field} 需要非负数值`, 400);
    if (n > MAX_BATCH_QTY) throw new AppError(`字段 ${field} 不能超过 ${MAX_BATCH_QTY}`, 400);
    const scaled = n * 1000;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) throw new AppError(`字段 ${field} 最多保留 3 位小数`, 400);
    return n;
  }
  const s = sanitizeText(raw, 200);
  if (s.length > 200) throw new AppError(`字段 ${field} 超长`, 400);
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionChecked();
    if (!session) return errorResponse('请先登录', 401);

    await requirePermission('product:edit');
    const body = await req.json();
    const { ids, field, value } = body || {};

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      return errorResponse('ids 必须是 1–500 个商品 ID 的数组', 400);
    }
    if (!field || typeof field !== 'string' || !ALLOWED_FIELDS[field]) {
      return errorResponse(`不支持批量修改字段 ${field || ''}，允许：${Object.keys(ALLOWED_FIELDS).join('、')}`, 400);
    }

    const numericIds = ids.map((v: unknown) => Number(v));
    if (numericIds.some((n) => !Number.isInteger(n) || n <= 0)) {
      return errorResponse('ids 含非法商品 ID', 400);
    }

    const data = { [field]: coerce(field, value) };
    const result = await prisma.product.updateMany({
      where: { id: { in: numericIds } },
      data,
    });

    return successResponse({ count: result.count }, '批量修改成功');
  } catch (error) {
    return handleApiError(error);
  }
}