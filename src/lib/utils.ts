import dayjs from 'dayjs';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * 生成单据编号
 * 格式：前缀 + 日期 + 4位序号，如 IN20240101-0001
 */
export async function generateOrderNo(prefix: string, prisma: any): Promise<string> {
  const date = dayjs().format('YYYYMMDD');
  const pattern = `${prefix}${date}-%`;

  const lastOrder = await prisma.$queryRaw`
    SELECT order_no FROM (
      SELECT order_no FROM inbound_orders WHERE order_no LIKE ${pattern}
      UNION ALL
      SELECT order_no FROM outbound_orders WHERE order_no LIKE ${pattern}
      UNION ALL
      SELECT order_no FROM transfer_orders WHERE order_no LIKE ${pattern}
      UNION ALL
      SELECT order_no FROM count_orders WHERE order_no LIKE ${pattern}
      UNION ALL
      SELECT order_no FROM purchase_orders WHERE order_no LIKE ${pattern}
      UNION ALL
      SELECT order_no FROM sales_orders WHERE order_no LIKE ${pattern}
    ) t
    ORDER BY order_no DESC
    LIMIT 1
  `;

  let seq = 1;
  if (lastOrder.length > 0 && lastOrder[0].order_no) {
    const lastSeq = parseInt(lastOrder[0].order_no.split('-')[1], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${date}-${seq.toString().padStart(4, '0')}`;
}

/**
 * 安全地将 Decimal 转为 number
 */
export function decimalToNumber(value: Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

/**
 * 安全地将 Decimal 转为 string（保留精度）
 */
export function decimalToString(value: Decimal | null | undefined, decimals: number = 3): string {
  if (value === null || value === undefined) return '0';
  return Number(value.toString()).toFixed(decimals);
}

/**
 * BigInt 序列化为 string（JSON 安全）
 */
export function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

/**
 * 统一 API 响应格式
 */
export function successResponse<T>(data: T, message?: string) {
  return Response.json({
    code: 0,
    message: message || 'success',
    data: serializeBigInt(data),
  });
}

export function errorResponse(message: string, code: number = 400) {
  return Response.json(
    { code, message, data: null },
    { status: code >= 500 ? 500 : 200 }
  );
}

/**
 * 解析分页参数
 */
export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/**
 * 计算可用量：on_hand - locked
 */
export function calcAvailable(onHand: Decimal, locked: Decimal): Decimal {
  return new Decimal(onHand.toString()).minus(locked.toString());
}

/**
 * 生成当前时间段（月度）
 */
export function getCurrentPeriod(): string {
  return dayjs().format('YYYY-MM');
}

/**
 * 安全解析 JSON
 */
export function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}
