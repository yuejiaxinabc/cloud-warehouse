import { Prisma } from '@prisma/client';
import { AppError } from '@/lib/errors';
import { assertPositiveQty } from '@/lib/qty-guard';

export function positiveId(value: unknown, label: string): bigint {
  if (!['number', 'string', 'bigint'].includes(typeof value) || !/^\d+$/.test(String(value)) || BigInt(String(value)) <= BigInt(0) || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new AppError(label + '必须是正整数', 400);
  }
  const id = BigInt(String(value));
  if (id > BigInt('18446744073709551615')) throw new AppError(label + '超出范围', 400);
  return id;
}

/** Move quantity, not a stock receipt. The caller must supply a transaction. */
export async function allocateLocation(tx: Prisma.TransactionClient, body: any) {
  const productId = positiveId(body.productId, '商品ID');
  const warehouseId = positiveId(body.warehouseId, '仓库ID');
  const locationId = positiveId(body.locationId, '货位ID');
  const boxId = body.boxId == null || body.boxId === '' ? null : positiveId(body.boxId, '盒子ID');
  const qty = new Prisma.Decimal(assertPositiveQty(body.quantity));
  const requestedLot = body.lotNumber == null || body.lotNumber === '' ? null : String(body.lotNumber);
  if (requestedLot && requestedLot.length > 50) throw new AppError('批次号过长', 400);

  // All allocations for the same inventory serialize; lock before the first consistent read.
  const locked = await tx.$queryRaw<Array<{ id: bigint }>>
    `SELECT id FROM inventory WHERE product_id = ${productId} AND warehouse_id = ${warehouseId} AND sku_variant_id = 0 FOR UPDATE`;
  if (!locked.length) throw new AppError('该商品在仓库中没有库存', 400);
  await tx.$queryRaw`SELECT id FROM locations WHERE id = ${locationId} FOR UPDATE`;
  const inventory = await tx.inventory.findUnique({ where: { id: locked[0].id } });
  if (!inventory) throw new AppError('库存不存在', 404);
  const location = await tx.location.findUnique({ where: { id: locationId }, include: { zone: true } });
  if (!location || location.zone.warehouseId !== warehouseId) throw new AppError('货位不属于当前仓库', 400);
  if (location.status !== 1 || location.zone.status !== 1) throw new AppError('货位或货区已停用', 400);
  if (boxId !== null) {
    const box = await tx.box.findUnique({ where: { id: boxId } });
    if (!box || box.locationId !== locationId || box.status !== 1) throw new AppError('盒子不属于目标货位或已停用', 400);
  }
  // No take limit: any foreign product at this location is a conflict.
  const occupied = await tx.locationStock.findFirst({ where: { locationId, productId: { not: productId }, quantity: { gt: 0 } } });
  if (occupied) throw new AppError('货位已被其他商品占用，请选择其他货位', 400);
  const rows = await tx.locationStock.findMany({ where: { inventoryId: inventory.id }, orderBy: { id: 'asc' } });
  const allocated = rows.reduce((sum, row) => sum.add(row.quantity), new Prisma.Decimal(0));
  const onHand = new Prisma.Decimal(inventory.onHand);
  if (rows.some(row => row.quantity.lt(0)) || allocated.gt(onHand)) throw new AppError('货位数量与主库存存在历史差异，请先核对', 409);
  if (qty.gt(onHand)) throw new AppError('分配数量超过现存库存', 400);
  const atTarget = (row: typeof rows[number]) => row.locationId === locationId && row.boxId === boxId;
  const sources = rows.filter(row => !atTarget(row) && row.quantity.gt(0) && (!requestedLot || row.lotNumber === requestedLot));
  const unassigned = onHand.sub(allocated);
  const movable = sources.reduce((sum, row) => sum.add(row.quantity), new Prisma.Decimal(0));
  if (qty.gt(movable.add(unassigned))) throw new AppError('分配数量超过其他货位及未分配库存余量', 400);
  let remaining = qty;
  let removedAtLocation = new Prisma.Decimal(0);
  const additions = new Map<string | null, Prisma.Decimal>();
  const add = (lot: string | null, amount: Prisma.Decimal) => additions.set(lot, (additions.get(lot) || new Prisma.Decimal(0)).add(amount));
  const deductions: { id: bigint; quantity: Prisma.Decimal }[] = [];
  for (const source of sources) {
    if (remaining.lte(0)) break;
    const moved = Prisma.Decimal.min(remaining, source.quantity);
    deductions.push({ id: source.id, quantity: source.quantity.sub(moved) });
    add(source.lotNumber, moved);
    if (source.locationId === locationId) removedAtLocation = removedAtLocation.add(moved);
    remaining = remaining.sub(moved);
  }
  // Never invent a batch from "latest lot". Explicit batches require a matching unallocated balance.
  if (remaining.gt(0) && requestedLot) {
    const lots = await tx.inventoryLot.findMany({ where: { productId, warehouseId, lotNumber: requestedLot } });
    const lotQty = lots.reduce((sum, lot) => sum.add(lot.quantity), new Prisma.Decimal(0));
    const lotPlaced = rows.filter(row => row.lotNumber === requestedLot).reduce((sum, row) => sum.add(row.quantity), new Prisma.Decimal(0));
    if (remaining.gt(lotQty.sub(lotPlaced))) throw new AppError('指定批次的未分配数量不足', 400);
  }
  if (remaining.gt(0)) add(requestedLot, remaining);
  const used = await tx.locationStock.aggregate({ where: { locationId }, _sum: { quantity: true } });
  if (location.capacity && location.capacity.gt(0) && new Prisma.Decimal(used._sum.quantity || 0).sub(removedAtLocation).add(qty).gt(location.capacity)) {
    throw new AppError('目标货位容量不足', 400);
  }
  for (const deduction of deductions) {
    if (deduction.quantity.isZero()) await tx.locationStock.delete({ where: { id: deduction.id } });
    else await tx.locationStock.update({ where: { id: deduction.id }, data: { quantity: deduction.quantity } });
  }
  for (const [lotNumber, amount] of additions) {
    const target = rows.find(row => atTarget(row) && row.lotNumber === lotNumber);
    if (target) await tx.locationStock.update({ where: { id: target.id }, data: { quantity: { increment: amount } } });
    else await tx.locationStock.create({ data: { inventoryId: inventory.id, productId, warehouseId, locationId, boxId, lotNumber, quantity: amount } });
  }
  // Intentionally no inventory/onHand/locked/available or lot-balance write.
}
