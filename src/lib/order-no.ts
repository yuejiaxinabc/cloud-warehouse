import { Prisma } from '@prisma/client';

/**
 * 单号生成（v1.2.1 / P1-11）
 *
 * 旧方案是「当日前缀 count() + 1」：并发的两个请求读到同一个 count，
 * 生成同一个单号，唯一约束一报错整个请求就 500（实测 3 并发必挂 1 张）。
 *
 * 现在改成两步：
 *   1) nextOrderNo：取当日前缀下最大的单号（零填充后字典序即数值序）+ 探测空号；
 *   2) createWithOrderNo：真正 insert 时若仍撞唯一约束（P2002），换号重试，最多 3 次。
 * 不引入序列表/新依赖，保持「前缀 + 日期 + 序号」的可读格式不变。
 */

const MAX_ATTEMPTS = 3;
/** 单次生成时最多探测多少个候选序号（正常情况下第 1 个就命中） */
const MAX_PROBE = 50;

/** 日期段：YYYYMMDD（沿用旧单号格式） */
export function formatOrderDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

type DbClient = any;

/**
 * 生成下一个单号，如 RK20261028-0007。
 * @param db     prisma 或事务客户端
 * @param model  模型名（inboundOrder / outboundOrder / transferOrder / countOrder / purchaseRequest）
 * @param prefix 单号前缀（RK / CK / TR / PD / GQ）
 * @param options.field 单号字段名，默认 orderNo（购买申请是 requestNo）
 */
export async function nextOrderNo(
  db: DbClient,
  model: string,
  prefix: string,
  options: { field?: string; date?: Date } = {}
): Promise<string> {
  const field = options.field || 'orderNo';
  const head = `${prefix}${formatOrderDate(options.date)}-`;
  const delegate = db?.[model];
  if (!delegate) throw new Error(`未知的单据模型：${model}`);

  const last = await delegate.findFirst({
    where: { [field]: { startsWith: head } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });

  let seq = 0;
  if (last && typeof last[field] === 'string') {
    const parsed = Number.parseInt(String(last[field]).slice(head.length), 10);
    if (Number.isFinite(parsed) && parsed > 0) seq = parsed;
  }

  for (let i = 1; i <= MAX_PROBE; i++) {
    const candidate = `${head}${String(seq + i).padStart(4, '0')}`;
    const dup = await delegate.findFirst({ where: { [field]: candidate }, select: { id: true } });
    if (!dup) return candidate;
  }

  // 当日号段异常拥挤（>50 个候选都被占）：退化成时间戳后缀，宁可单号不好看也不能阻塞业务
  return `${head}${String(Date.now()).slice(-6)}`;
}

/** 是否是唯一约束冲突（Prisma P2002） */
export function isUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === 'P2002';
  return (error as any)?.code === 'P2002';
}

/**
 * 生成单号并创建单据；唯一冲突时换号重试（最多 3 次）。
 * create 回调必须自己完成 insert（这样才能把重试包含进去）。
 */
export async function createWithOrderNo<T>(
  db: DbClient,
  opts: {
    model: string;
    prefix: string;
    field?: string;
    date?: Date;
    create: (orderNo: string) => Promise<T>;
  }
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const orderNo = await nextOrderNo(db, opts.model, opts.prefix, {
      field: opts.field,
      date: opts.date,
    });
    try {
      return await opts.create(orderNo);
    } catch (error) {
      lastError = error;
      // 只有唯一约束冲突才重试（其它错误原样抛出，避免掩盖真正的业务错误）
      if (!isUniqueConflict(error) || attempt === MAX_ATTEMPTS - 1) throw error;
    }
  }

  throw lastError ?? new Error('单号生成失败，请重试');
}
