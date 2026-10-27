import { prisma } from './prisma';

/**
 * 货位绑定（FIX-2026-1013）
 *
 * 背景：线上出现「库存有 6 条、货架地图一片空白」。
 * 根因是 stock-in.service 只写了 inventory，既没写 inventory.locationId，
 * 也没写 location_stocks；而货架地图只读 location_stocks。
 * 结果商品在库里存在，在货架上不存在 —— 货和位彻底脱钩。
 *
 * 从这版开始：商品落库必须带一个合法货位，且编码为四段
 *   区-排-列-位，例如 A-01-02-03
 * 三段旧编码（A-01-01）会自动补一段，避免历史数据直接不可用。
 */

/** 四段货位码：区(1位字母)-排(2位)-列(2位)-位(2位) */
export const LOCATION_CODE_RE = /^[A-Z]-\d{2}-\d{2}-\d{2}$/;

/** 三段旧编码，用于自动补齐 */
const LEGACY_CODE_RE = /^[A-Z]-\d{2}-\d{2}$/;

/**
 * 归一化货位编码：三段自动补成四段（层补 01）。
 * 已经是四段则原样返回；其它格式抛出可读错误。
 */
export function normalizeLocationCode(raw: string): string {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) throw new Error('货位编码不能为空');
  if (LOCATION_CODE_RE.test(code)) return code;
  if (LEGACY_CODE_RE.test(code)) return code + '-01';
  throw new Error('货位编码必须为四段格式 区-排-列-位，例如 A-01-02-03');
}

export function isValidLocationCode(raw: string): boolean {
  try {
    normalizeLocationCode(raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * 给库存记录绑定货位明细。
 *
 * 必须在同一个事务里调用 —— 否则会出现 inventory 写成功、
 * location_stocks 写失败的半截状态，又回到「有货无位」。
 */
export async function syncLocationStock(
  tx: any,
  params: {
    inventoryId: bigint;
    productId: bigint;
    warehouseId: bigint;
    locationId: bigint;
    quantity: number | string;
    lotNumber?: string | null;
    boxId?: bigint | null;
  }
): Promise<void> {
  const { inventoryId, productId, warehouseId, locationId, lotNumber, boxId } = params;
  const quantity = Number(params.quantity || 0);
  if (quantity <= 0) return;

  const existing = await tx.locationStock.findFirst({
    where: { inventoryId, locationId, lotNumber: lotNumber ?? null },
  });

  if (existing) {
    await tx.locationStock.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } },
    });
  } else {
    await tx.locationStock.create({
      data: {
        inventoryId,
        productId,
        warehouseId,
        locationId,
        boxId: boxId ?? null,
        lotNumber: lotNumber ?? null,
        quantity,
      },
    });
  }
}

/**
 * 校验一个货位确实属于指定仓库（防止把 A 仓的货塞进 B 仓的货位）。
 */
export async function assertLocationInWarehouse(
  tx: any,
  locationId: bigint | number,
  warehouseId: bigint | number
): Promise<void> {
  const loc = await tx.location.findUnique({
    where: { id: BigInt(locationId) },
    select: { id: true, code: true, zone: { select: { warehouseId: true } } },
  });
  if (!loc) throw new Error('货位不存在');
  if (String(loc.zone.warehouseId) !== String(warehouseId)) {
    throw new Error(`货位 ${loc.code} 不属于当前仓库`);
  }
}

/**
 * 修复存量数据：把「有库存但没货位明细」的记录补上 location_stocks。
 * 部署后跑一次即可，幂等。
 */
export async function repairLocationStocks(): Promise<{ scanned: number; created: number; skipped: number }> {
  const inventories = await prisma.inventory.findMany({
    where: { locationId: { not: null } },
  });

  let created = 0;
  let skipped = 0;

  for (const inv of inventories) {
    const exists = await prisma.locationStock.findFirst({
      where: { inventoryId: inv.id, locationId: inv.locationId! },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.locationStock.create({
      data: {
        inventoryId: inv.id,
        productId: inv.productId,
        warehouseId: inv.warehouseId,
        locationId: inv.locationId!,
        quantity: inv.onHand,
      },
    });
    created++;
  }

  return { scanned: inventories.length, created, skipped };
}