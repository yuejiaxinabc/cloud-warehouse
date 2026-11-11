import { Prisma } from '@prisma/client';

/**
 * 单据行级排他锁（H2）
 *
 * v1.2.1 之前过账是典型的 check-then-act：
 *   读到 status=DRAFT → …… → 写 status=POSTED + 加库存
 * 两条并发请求都能通过第一步检查，于是同一张单被加两次库存（实测 5 连发 2 次成功、库存 +4）。
 *
 * 修法：进入事务后第一件事就 SELECT ... FOR UPDATE 锁住单据行。
 * 第二条请求会阻塞到第一条提交，再读时 status 已是 POSTED → 直接拒绝。
 * 表名走白名单，不接受外部拼接。
 */
const LOCKABLE_TABLES = ['inbound_orders', 'outbound_orders', 'transfer_orders', 'count_orders'] as const;

export type LockableTable = (typeof LOCKABLE_TABLES)[number];

export async function lockOrderRow(
  tx: Prisma.TransactionClient,
  table: LockableTable,
  id: bigint | number | string
): Promise<boolean> {
  if (!LOCKABLE_TABLES.includes(table)) {
    throw new Error('unsupported lock table: ' + table);
  }
  const bigId = typeof id === 'bigint' ? id : BigInt(String(id).trim());
  if (bigId <= BigInt(0)) return false;

  // 表名来自白名单常量，id 走参数绑定
  const rows = await tx.$queryRawUnsafe<Array<{ id: bigint | number }>>(
    'SELECT id FROM ' + table + ' WHERE id = ? FOR UPDATE',
    bigId
  );
  return Array.isArray(rows) && rows.length > 0;
}
