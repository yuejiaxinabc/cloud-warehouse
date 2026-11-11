import { AppError } from './errors';
import { MAX_UNIT_PRICE, toNumeric } from './qty-guard';
import { sanitizeText } from './sanitize';

/**
 * 商品字段防线（F8 / F9）
 *
 * 报告里的两处现象都源于「直接 Number(body.x) 后原样写库」：
 *  - salePrice=1e15 → Decimal(18,4) 溢出，Prisma 抛错，前端看到「数据库操作失败」；
 *  - salePrice=-1 / defaultCost=-10 → 负数照样落库，成本与报表被污染；
 *  - name 长度 1000+ → 超过 VarChar(200)，同样是数据库报错而不是友好提示。
 *
 * 这里按 schema 的列宽做白名单校验，超限/负数/非数值统一抛 AppError（400 + 可读文案）。
 */

export const PRODUCT_LIMITS = {
  name: 200,
  code: 50,
  barcode: 50,
  spec: 500,
  brand: 100,
  model: 100,
  remark: 500,
  imageUrl: 500,
} as const;

function asText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

export function requireProductName(value: unknown): string {
  // v1.2.4 B：入库即去标签（XSS 纵深防御），展示时 React 再转义一次。
  const name = sanitizeText(value, PRODUCT_LIMITS.name);
  if (!name) throw new AppError('请填写商品名称', 400);
  if (name.length > PRODUCT_LIMITS.name) {
    throw new AppError('商品名称不能超过 ' + PRODUCT_LIMITS.name + ' 个字符', 400);
  }
  return name;
}

export function requireProductCode(value: unknown): string {
  const code = asText(value);
  if (!code) throw new AppError('请填写商品编码', 400);
  if (code.length > PRODUCT_LIMITS.code) {
    throw new AppError('商品编码不能超过 ' + PRODUCT_LIMITS.code + ' 个字符', 400);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(code)) {
    throw new AppError('商品编码只能包含字母、数字、下划线、点和中划线', 400);
  }
  return code;
}

/** 可选文本：undefined 表示「不修改」，空串表示「清空」；入库即去标签 */
export function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  const text = sanitizeText(value, max);
  if (!text) return null;
  if (text.length > max) {
    throw new AppError(field + '不能超过 ' + max + ' 个字符', 400);
  }
  return text;
}

/** 可选金额：允许 0，不允许负数与超上限 */
export function optionalMoney(value: unknown, field: string, max = MAX_UNIT_PRICE): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = toNumeric(value);
  if (!Number.isFinite(n)) throw new AppError(field + '必须是数字', 400);
  if (n < 0) throw new AppError(field + '不能为负数', 400);
  if (n > max) throw new AppError(field + '不能超过 ' + max, 400);
  return n;
}

/** 可选数量（3 位小数，非负，上限默认 1,000,000） */
export function optionalQty(value: unknown, field: string, max = 1_000_000): number | null | undefined {
  const n = optionalMoney(value, field, max);
  if (n === undefined || n === null) return n;
  const scaled = n * 1000;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new AppError(field + '最多保留 3 位小数', 400);
  }
  return n;
}

/** 可选整数（如保质期天数、采购周期） */
export function optionalInt(
  value: unknown,
  field: string,
  min = 0,
  max = 36500
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = toNumeric(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new AppError(field + '必须是整数', 400);
  if (n < min || n > max) throw new AppError(field + '需在 ' + min + ' ~ ' + max + ' 之间', 400);
  return n;
}

/** 状态位：只接受 0/1 */
export function optionalStatus(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (n !== 0 && n !== 1) throw new AppError('状态只能是 0（禁用）或 1（启用）', 400);
  return n;
}
