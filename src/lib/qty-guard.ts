import { AppError } from './errors';

/**
 * 数量 / 金额防线（H1、F8、F9）
 *
 * v1.2.1 之前：入库/出库只挡了「未登录」，负数与 1e9 这类极端值可以直接建单并过账，
 * 实测能把库存写成 -5、把加权平均成本推到 22.5 亿，事后无法用业务操作修回。
 * 这里把「正数 / 上限 / 小数位」三件事收成一处，路由与过账服务共用同一套判定。
 */

/** 单行数量上限：超过这个量级必然是误输入或攻击 */
export const MAX_LINE_QTY = 1_000_000;
/**
 * 单价上限（元）：v1.2.4 B 由 100,000,000 收紧为 1,000,000。
 * 1e6 以上的单价/成本在本系统没有真实业务场景（此前 1e15 能直接打到
 * Decimal(18,4) 溢出）；如未来确有超百万单价商品，需由业务方确认后放宽。
 */
export const MAX_UNIT_PRICE = 1_000_000;
/** 单据金额上限（元） */
export const MAX_AMOUNT = 1e12;
/** 数量小数位（与 Decimal(18,3) 对齐） */
const QTY_DECIMALS = 3;

/**
 * 只接受「纯数字」写法：可选负号 / 小数 / 科学计数法。
 * 带货币符号（¥/$）、千分位逗号、十六进制（0x10）、Infinity 等一律判为 NaN，
 * 由调用方报 400 —— 绝不能悄悄 strip 后入库（"¥2,250,000,004.38" 曾被
 * 某些 toNum 实现去逗号后当成 2250000004.38 参与计算）。
 */
const PURE_NUMBER_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function toNumeric(input: unknown): number {
  if (typeof input === 'number') return input;
  if (typeof input === 'string') {
    const text = input.trim();
    if (text === '' || !PURE_NUMBER_RE.test(text)) return NaN;
    return Number(text);
  }
  // Prisma.Decimal（过账时从库里读出来的 quantity/costPrice 都是它）
  // 早期实现只认 number/string，导致过账时把 Decimal 判成 NaN，
  // 所有单据都会被误报「数量必须大于 0」——这里统一按 toString 转数值。
  if (input !== null && typeof input === 'object') {
    const anyInput = input as any;
    if (typeof anyInput.toNumber === 'function') return Number(anyInput.toNumber());
    const text = String(input);
    if (text !== '[object Object]' && text.trim() !== '') return Number(text.trim());
  }
  return NaN;
}

/** 数量必须 > 0、有上限、且最多 3 位小数 */
export function assertPositiveQty(input: unknown, label = '数量', max = MAX_LINE_QTY): number {
  const n = toNumeric(input);
  if (!Number.isFinite(n) || n <= 0) {
    throw new AppError(label + '必须大于 0', 400);
  }
  if (n > max) {
    throw new AppError(label + '不能超过 ' + max, 400);
  }
  const scaled = n * 10 ** QTY_DECIMALS;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new AppError(label + '最多保留 ' + QTY_DECIMALS + ' 位小数', 400);
  }
  return n;
}

/** 单价：允许 0（赠品/免费样品），不允许负数与天文数字 */
export function assertNonNegativePrice(input: unknown, label = '单价', max = MAX_UNIT_PRICE): number {
  const n = toNumeric(input);
  if (!Number.isFinite(n)) {
    throw new AppError(label + '格式不正确', 400);
  }
  if (n < 0) {
    throw new AppError(label + '不能为负数', 400);
  }
  if (n > max) {
    throw new AppError(label + '不能超过 ' + max, 400);
  }
  return n;
}

/** 单据金额上限校验（防止 数量 × 单价 溢出 Decimal）；负数金额直接拒绝 */
export function assertAmountWithinLimit(amount: number, label = '单据金额'): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new AppError(label + '不能为负数', 400);
  }
  if (amount > MAX_AMOUNT) {
    throw new AppError(label + '超出可用范围（上限 ' + MAX_AMOUNT + '）', 400);
  }
  return amount;
}

/**
 * 金额（行金额/总金额）校验：必须 >= 0 且 <= 上限，NaN / 负数 / 超限一律 400。
 * 与 assertAmountWithinLimit 的区别：本函数接受任意输入（含字符串），
 * 供商品/导入等「先校验再落库」的路径使用；单据过账路径继续用
 * assertAmountWithinLimit（入参已是 number）。
 */
export function assertNonNegativeAmount(input: unknown, label = '金额', max = MAX_AMOUNT): number {
  const n = toNumeric(input);
  if (!Number.isFinite(n)) {
    throw new AppError(label + '格式不正确', 400);
  }
  if (n < 0) {
    throw new AppError(label + '不能为负数', 400);
  }
  if (n > max) {
    throw new AppError(label + '不能超过 ' + max, 400);
  }
  return n;
}
