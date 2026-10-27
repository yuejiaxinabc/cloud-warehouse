import { prisma } from './prisma';
import { AppError } from './errors';

/**
 * 货位独占校验（FIX-2026-1023）
 *
 * 业务规则：一个货位只能放同一种商品。
 * A-01-01-01 里是 10K 电阻，就不能再塞螺丝进去 —— 否则货架地图上
 * 「这个位置到底是什么」就说不清了，找货、盘点、拣货全乱。
 *
 * 已占用的货位要么换货位，要么把原商品清空后才能复用。
 */
export async function assertLocationAvailableFor(
  tx: any,
  params: { locationId: bigint | number; productId: bigint | number }
): Promise<void> {
  const locationId = BigInt(params.locationId);
  const productId = BigInt(params.productId);

  const occupied = await tx.locationStock.findMany({
    where: { locationId, quantity: { gt: 0 } },
    select: { productId: true, product: { select: { code: true, name: true } } },
    take: 20,
  });

  if (!occupied.length) return;   // 空货位，随便放

  const others = occupied.filter((r: any) => r.productId.toString() !== productId.toString());
  if (!others.length) return;     // 全是同一种商品，允许继续放

  const first = others[0];
  // 用 AppError 抛出，handleApiError 才会把原因原样返回给前端
  throw new AppError(
    `货位已被商品「${first.product?.name || ''}（${first.product?.code || ''}）」占用。` +
    `一个货位只能放同一种商品，请换一个货位，或先清空该货位`,
    400
  );
}

/** 批量查出每个货位当前占用的是哪个商品（前端用来过滤下拉） */
export async function loadLocationOccupancy(
  warehouseId: bigint | number
): Promise<Map<string, { productId: string; productCode: string; productName: string }>> {
  const rows = await prisma.locationStock.findMany({
    where: { warehouseId: BigInt(warehouseId), quantity: { gt: 0 } },
    select: {
      locationId: true,
      productId: true,
      product: { select: { code: true, name: true } },
    },
  });
  const map = new Map<string, { productId: string; productCode: string; productName: string }>();
  for (const r of rows) {
    const k = r.locationId.toString();
    if (!map.has(k)) {
      map.set(k, {
        productId: r.productId.toString(),
        productCode: r.product?.code || '',
        productName: r.product?.name || '',
      });
    }
  }
  return map;
}
