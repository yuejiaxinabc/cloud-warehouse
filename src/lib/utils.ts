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
 * 计算可用量：max(0, on_hand - locked)，永不为负
 * （v1.2.4 B：锁定量异常大于在手量时也不展示负数）
 */
export function calcAvailable(onHand: Decimal, locked: Decimal): Decimal {
  const diff = new Decimal(onHand.toString()).minus(locked.toString());
  return diff.isNegative() ? new Decimal(0) : diff;
}

/** 可用量（number 版）：max(0, 在手 - 锁定) */
export function calcAvailableNumber(onHand: unknown, locked: unknown): number {
  const n = Number(onHand || 0) - Number(locked || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** 金额四舍五入到 2 位小数（报表/导出统一用它，避免各处 toFixed 写法不一） */
export function roundMoney(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** 数量四舍五入到 3 位小数 */
export function roundQty(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
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

// ---------------------------------------------------------------------------
// 统一展示口径（v1.2.4 B）：全站金额 / 日期 / 数量只用下面这组函数，
// 不要再各处手写 toFixed / toLocaleString / slice(0,10)，否则口径又会漂移。
// 注意：API 层返回给前端的仍是数字（由前端调这些函数渲染）；
// 只有拼进文案里的字符串（如报表公式说明、导出提示）才直接调它们。
// ---------------------------------------------------------------------------

/** 金额：¥ + 千分位 + 2 位小数，如 ¥1,234.56；非法值返回 ¥0.00 */
export function formatMoney(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '¥0.00';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n).toFixed(2);
  const [int, dec] = abs.split('.');
  return `${sign}¥${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/** 数量：不带小数尾巴，如 100 而不是 100.00；最多保留 3 位小数 */
export function formatQty(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}

/** 日期：YYYY-MM-DD；空值/非法值返回 '' */
export function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = dayjs(value as any);
  return d.isValid() ? d.format('YYYY-MM-DD') : '';
}

/** 日期时间：YYYY-MM-DD HH:mm；空值/非法值返回 '' */
export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = dayjs(value as any);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '';
}

/** 大屏日期：YYYY年MM月DD日 星期X（星期前加空格），如 2026年11月11日 星期三 */
export function formatBigScreenDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const d = dayjs(value as any);
  if (!d.isValid()) return '';
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.day()];
  return `${d.format('YYYY年MM月DD日')} 星期${week}`;
}
