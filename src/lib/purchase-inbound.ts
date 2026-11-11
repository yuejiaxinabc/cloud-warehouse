import { AppError } from '@/lib/errors';
import { assertPositiveQty, assertNonNegativePrice } from '@/lib/qty-guard';
import { prisma } from '@/lib/prisma';
import { StockInService } from '@/services/stock-in.service';

type InboundParams = {
  warehouseId: number;
  locationId: number;
  boxId?: number | null;
  unitCost?: number;
};

// 型号归一化：去空格，空串视为 null
function normModel(s: string | null | undefined): string | null {
  const t = (s || '').trim();
  return t === '' ? null : t;
}

/**
 * 按名称+型号查找已有商品，找不到才创建（防止重复建档）。
 * 匹配策略：
 * 1. 名称 + 型号（双方都归一化后相等）
 * 2. 同名商品只有一个 → 直接复用（若商品型号为空且申请有型号，自动补填）
 * 3. 以上都不满足 → 新建
 */
export async function findOrCreateProduct(
  name: string,
  model: string | null,
  color: string | null,
  size: string | null,
  remark: string
) {
  const reqName = name.trim();
  const reqModel = normModel(model);

  const candidates = await prisma.product.findMany({
    where: { name: reqName },
    select: { id: true, name: true, model: true, code: true, spec: true },
  });

  let product = candidates.find((p) => normModel(p.model) === reqModel);

  if (!product && candidates.length === 1) {
    // 仅一个同名商品：视为同一备件，复用；型号为空则补填
    product = candidates[0];
    if (reqModel && !normModel(product.model)) {
      product = await prisma.product.update({
        where: { id: product.id },
        data: { model: reqModel },
      });
    }
  }

  if (product) {
    return { product, created: false };
  }

  const now = new Date();
  const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const specParts: string[] = [];
  if (color) specParts.push(`颜色:${color}`);
  if (size) specParts.push(`尺寸:${size}`);

  const created = await prisma.product.create({
    data: {
      name: reqName,
      code: `BJ${dateStr}${rand}`,
      model: reqModel,
      spec: specParts.length > 0 ? specParts.join(';') : null,
      costMethod: 'WEIGHTED',
      remark,
    },
  });
  return { product: created, created: true };
}

/**
 * 购买申请入库：自动创建/匹配商品 → 创建采购入库单并过账 → 写入库位库存
 * 供 complete（完成直接入库）与 inbound（已完成补入库）复用
 */
export async function inboundPurchaseRequest(
  request: {
    id: bigint;
    requestNo: string;
    name: string;
    model: string | null;
    color: string | null;
    size: string | null;
    quantity: any; // Prisma Decimal / number
  },
  params: InboundParams,
  operatorId?: number
) {
  const { warehouseId, locationId, boxId, unitCost } = params;
  const qty = assertPositiveQty(request.quantity);
  const cost = assertNonNegativePrice(unitCost ?? 0);
  if (boxId) throw new AppError('采购入库请直接选择货位，盒子级分配暂未支持', 400);

  // 1. 查找已有商品，不存在才创建（防重复建档）
  const { product } = await findOrCreateProduct(
    request.name,
    request.model,
    request.color,
    request.size,
    `购买申请 ${request.requestNo} 入库`
  );

  // 2. 创建采购入库单并过账（复用入库服务：更新库存/批次/流水）
  const order = await StockInService.create({
    type: 'PURCHASE',
    warehouseId,
    remark: `购买申请 ${request.requestNo} 完成入库`,
    items: [
      {
        productId: Number(product.id),
        quantity: qty,
        locationId,
        costPrice: cost > 0 ? cost : undefined,
      },
    ],
    operatorId,
  });
  await StockInService.post(Number(order.id), operatorId);

  // StockInService.post already synchronizes location stocks in its inventory transaction.
  // Do not write locationStock a second time after posting.
  return { order, product };
}
