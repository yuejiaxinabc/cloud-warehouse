import { Prisma } from '@prisma/client';

/**
 * 库存原子操作（P0-1 修复）
 *
 * 原来的写法是「查 → 判断 → 写」三步（check-then-act），并发时：
 *  - 10 个请求同时读到 on_hand=5，全部判断通过 → 超卖；
 *  - 各自用自己算出的新值覆盖 → 丢失更新。
 * version 字段只是无条件自增，没有参与 WHERE，等于假乐观锁。
 *
 * 这里统一改成「单条带条件的 UPDATE」：数据库在行锁内完成判断与扣减，
 * affectedRows 就是权威结果，0 表示业务失败，调用方据此给出中文提示。
 */

type Tx = Prisma.TransactionClient;

async function syncAvailable(tx: Tx, inventoryId: bigint | number) {
  await tx.$executeRawUnsafe(
    'UPDATE inventory SET available = GREATEST(0, on_hand - locked) WHERE id = ?',
    inventoryId,
  );
}

/** 扣减在手库存：条件 on_hand - locked >= qty，既防超卖也不动用已锁定部分 */
export async function deductOnHand(tx: Tx, inventoryId: bigint | number, quantity: number): Promise<number> {
  const affected = await tx.$executeRawUnsafe(
    'UPDATE inventory SET on_hand = on_hand - ?, version = version + 1 WHERE id = ? AND on_hand - locked >= ?',
    quantity, inventoryId, quantity,
  );
  if (Number(affected) > 0) await syncAvailable(tx, inventoryId);
  return Number(affected);
}

/** 增加在手库存（入库/调入过账） */
export async function addOnHand(tx: Tx, inventoryId: bigint | number, quantity: number): Promise<number> {
  const affected = await tx.$executeRawUnsafe(
    'UPDATE inventory SET on_hand = on_hand + ?, version = version + 1 WHERE id = ?',
    quantity, inventoryId,
  );
  if (Number(affected) > 0) await syncAvailable(tx, inventoryId);
  return Number(affected);
}

/** 锁定可用库存（提交/审批占用量），不足则 affected=0 */
export async function lockAvailable(tx: Tx, inventoryId: bigint | number, quantity: number): Promise<number> {
  const affected = await tx.$executeRawUnsafe(
    'UPDATE inventory SET locked = locked + ?, version = version + 1 WHERE id = ? AND on_hand - locked >= ?',
    quantity, inventoryId, quantity,
  );
  if (Number(affected) > 0) await syncAvailable(tx, inventoryId);
  return Number(affected);
}

/** 释放锁定库存（取消/驳回），不会减到负数 */
export async function unlockAvailable(tx: Tx, inventoryId: bigint | number, quantity: number): Promise<number> {
  const affected = await tx.$executeRawUnsafe(
    'UPDATE inventory SET locked = GREATEST(0, locked - ?), version = version + 1 WHERE id = ?',
    quantity, inventoryId,
  );
  if (Number(affected) > 0) await syncAvailable(tx, inventoryId);
  return Number(affected);
}

/** 批次扣减：余量不足直接失败，绝不扣成负数 */
export async function deductLot(tx: Tx, lotId: bigint | number, quantity: number): Promise<number> {
  const affected = await tx.$executeRawUnsafe(
    'UPDATE inventory_lots SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
    quantity, lotId, quantity,
  );
  return Number(affected);
}

/** 货位扣减：并发下同样条件更新，扣不动由调用方换下一个货位 */
export async function deductLocationStock(tx: Tx, rowId: bigint | number, quantity: number): Promise<number> {
  const affected = await tx.$executeRawUnsafe(
    'UPDATE location_stocks SET quantity = quantity - ? WHERE id = ? AND quantity >= ?',
    quantity, rowId, quantity,
  );
  return Number(affected);
}

/**
 * 单据过账的原子状态转移。
 * 事务内先抢占：只有把状态改成 POSTING 的那个事务能继续，
 * 其余并发事务 affected=0，直接拒绝，杜绝「同一张单过账 10 次」。
 */
export async function claimPosting(
  tx: Tx,
  table: 'inbound_orders' | 'outbound_orders' | 'transfer_orders' | 'count_orders',
  id: bigint | number,
  allowed: string[],
): Promise<boolean> {
  const placeholders = allowed.map(() => '?').join(',');
  const affected = await tx.$executeRawUnsafe(
    'UPDATE ' + table + ' SET status = ? WHERE id = ? AND status IN (' + placeholders + ')',
    'POSTING', id, ...allowed,
  );
  return Number(affected) === 1;
}