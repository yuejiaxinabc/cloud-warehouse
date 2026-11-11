import { Prisma } from '@prisma/client';

/**
 * 库存可用量同步（v1.2.1 / P1-2）
 *
 * 背景：inventory.available 在库里只是普通列（@default(0)），不是数据库生成列。
 * 入库、调拨接收、盘点调整只写了 onHand，available 一直停在旧值，
 * 于是同一行库存出现「onHand 13 / locked 3 / available 0」这种自相矛盾的数据，
 * 前端下拉与出库预检都会误判。
 *
 * 约定：凡是改动 onHand / locked 的地方，都必须在**同一个事务内**调用本函数，
 * 语义统一为 available = max(0, onHand - locked)。v1.2.4 B：此前是 onHand - locked，
 * 锁定量异常大于在手量时 available 会写成负数并展示出来。
 *
 * 注意：这里不递增 version。available 是派生值，不代表业务状态变更，
 * 推进乐观锁版本号会让并发过账误报「库存数据已被修改」。
 */

/** 事务客户端或普通 PrismaClient 都可以传（路由层用 prisma，service 内用 tx） */
type DbClient = any;

/**
 * 按条件重算可用量，返回受影响的行数。
 * 典型用法：recalcAvailable(tx, { id: invId })
 *          recalcAvailable(tx, { productId, warehouseId })
 */
export async function recalcAvailable(
  tx: DbClient,
  where: Prisma.InventoryWhereInput
): Promise<number> {
  const rows = await tx.inventory.findMany({
    where,
    select: { id: true, onHand: true, locked: true },
  });

  for (const row of rows) {
    const available = new Prisma.Decimal(
      Math.max(0, Number(row.onHand || 0) - Number(row.locked || 0))
    );
    await tx.inventory.update({
      where: { id: row.id },
      data: { available },
    });
  }

  return rows.length;
}

/** 单条库存记录的可用量重算（最常用写法） */
export async function recalcAvailableById(
  tx: DbClient,
  inventoryId: bigint | number
): Promise<number> {
  return recalcAvailable(tx, { id: BigInt(inventoryId) });
}
