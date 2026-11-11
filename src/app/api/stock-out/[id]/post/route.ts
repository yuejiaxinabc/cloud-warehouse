import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed, type DataScope } from '@/lib/data-scope';
import { requireAuth, requirePermission } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emitWebhook } from '@/lib/webhook';
import { serializeBigInt } from '@/lib/serialize';
import { safeErrorMessage, handleApiError, AppError } from '@/lib/errors';
import { claimPosting, deductOnHand, deductLot, deductLocationStock } from '@/lib/stock-atomic';

/**
 * 出库过账（v1.2.0 起按 FEFO 选批）
 *
 * FEFO = First Expired, First Out：按批次到期日升序扣减，没有到期日的批次排最后，
 * 同到期日按入库先后（id 升序）。每笔扣减写一条 outbound_lot_picks，出库单可回溯到具体批次。
 *
 * 兼容：
 *  - 有保质期的商品（shelfLifeDays > 0）必须由批次库存足额覆盖，否则拒绝过账；
 *  - 普通商品若批次不足以覆盖（历史数据），剩余部分按「无批次」扣减，不阻断业务。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request);
    await requirePermission('stock_out:post', auth);
    const id = Number(params.id);
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    // v1.2.1：过账属于高权操作，auditor 等只读角色不得过账（P0-1）
    const userId = Number(auth.user.id);

    const order = await prisma.outboundOrder.findUnique({
      where: { id },
      include: { outboundItems: true },
    });

    if (!order) return NextResponse.json({ success: false, error: '出库单不存在' }, { status: 404 });
    await assertDocumentAllowed(await getDataScope(auth.user), auth.user, order);
    // v1.2.1：submit 之后单据是 LOCKED、审批通过后是 APPROVED。原实现只放行 DRAFT，
    // 导致「提交 → 审批 → 过账」这条正常链路永远走不通。现在 DRAFT/APPROVED 都放行，
    // LOCKED 明确告诉用户先去审批（或取消），不再抛一句无出路的提示。
    if (order.status === 'LOCKED') {
      return NextResponse.json(
        { success: false, error: '出库单已提交审批（库存已锁定），请先审批通过后再过账，或取消该单释放库存' },
        { status: 400 }
      );
    }
    if (order.status !== 'DRAFT' && order.status !== 'APPROVED') {
      return NextResponse.json({ success: false, error: '当前状态不允许过账' }, { status: 400 });
    }

    type PickSummary = { lotNumber: string | null; qty: number; expiredAt: Date | null };

    const picksByItem = new Map<string, PickSummary[]>();

    await prisma.$transaction(async (tx) => {
      // P0-1：先把状态原子抢占成 POSTING，只有抢到的事务能继续。
      // 并发过账同一张单时，其余事务这里就 affected=0，直接失败，不会重复扣减。
      const claimed = await claimPosting(tx, 'outbound_orders', id, ['DRAFT', 'APPROVED']);
      if (!claimed) {
        // 业务失败用 AppError(400)：并发冲突不是服务端故障，前端要能看到可读提示
        throw new AppError('该出库单正在被处理或已过账，请刷新后重试', 400);
      }

      for (const item of order.outboundItems) {
        const productId = Number(item.productId);
        const quantity = Number(item.quantity);
        const warehouseId = Number(order.warehouseId);

        const inventory = await tx.inventory.findFirst({ where: { productId, warehouseId } });
        if (!inventory || Number(inventory.onHand) < quantity) {
          throw new Error(`商品ID=${productId}库存不足`);
        }

        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { shelfLifeDays: true, name: true },
        });
        const needShelfLife = Number(product?.shelfLifeDays || 0) > 0;

        // ---- FEFO 选批：到期日近的优先，无到期日的排最后 ----
        const lotsRaw = await tx.inventoryLot.findMany({
          where: { productId: item.productId, warehouseId, quantity: { gt: 0 }, status: 1 },
        });
        const lots = lotsRaw.slice().sort((a, b) => {
          const aHas = a.expiredAt ? 1 : 0;
          const bHas = b.expiredAt ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas; // 有到期日的排前面
          if (a.expiredAt && b.expiredAt) {
            const diff = new Date(a.expiredAt).getTime() - new Date(b.expiredAt).getTime();
            if (diff !== 0) return diff;
          }
          return Number(a.id - b.id);
        });

        const availableLots = lots.reduce((s, l) => s + Number(l.quantity), 0);
        if (needShelfLife && availableLots < quantity) {
          throw new Error(
            `商品「${product?.name || productId}」批次库存不足：可用批次合计 ${availableLots}，本单需要 ${quantity}。请先入库补批次`
          );
        }

        const picks: PickSummary[] = [];
        let remain = quantity;

        for (const lot of lots) {
          if (remain <= 0) break;
          const lotQty = Number(lot.quantity);
          const deduct = Math.min(remain, lotQty);
          if (deduct <= 0) continue;

          // P0-1：条件更新，扣不动说明这批已被并发扣走，直接失败而不是扣成负数
          const lotOk = await deductLot(tx, lot.id, deduct);
          if (lotOk === 0) {
            throw new AppError(`批次 ${lot.lotNumber || lot.id} 余量不足（可能被并发扣减），请刷新后重试`, 400);
          }

          await tx.outboundLotPick.create({
            data: { outboundItemId: item.id, lotNumber: lot.lotNumber, quantity: deduct },
          });

          picks.push({ lotNumber: lot.lotNumber, qty: deduct, expiredAt: lot.expiredAt });
          remain -= deduct;
        }

        // 历史数据兜底：批次不够的部分记一笔「无批次」
        if (remain > 0) {
          picks.push({ lotNumber: null, qty: remain, expiredAt: null });
          remain = 0;
        }

        // ---- 货位库存：优先扣同一批次的货位，其次按入库时间 ----
        let remainLoc = quantity;
        const lotOrder = picks.filter((p) => p.lotNumber).map((p) => p.lotNumber as string);
        for (const lotNumber of lotOrder) {
          if (remainLoc <= 0) break;
          const need = picks.find((p) => p.lotNumber === lotNumber)?.qty || 0;
          let lotRemain = Math.min(need, remainLoc);
          const rows = await tx.locationStock.findMany({
            where: { inventoryId: inventory.id, lotNumber, quantity: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
          });
          for (const row of rows) {
            if (lotRemain <= 0) break;
            const rowQty = Number(row.quantity);
            const deduct = Math.min(lotRemain, rowQty);
            // 并发下可能被别人先扣走，扣不动就跳到下一个货位
            const locOk = await deductLocationStock(tx, row.id, deduct);
            if (locOk === 0) continue;
            lotRemain -= deduct;
            remainLoc -= deduct;
          }
        }
        if (remainLoc > 0) {
          const rows = await tx.locationStock.findMany({
            where: { inventoryId: inventory.id, quantity: { gt: 0 } },
            orderBy: { createdAt: 'asc' },
          });
          for (const row of rows) {
            if (remainLoc <= 0) break;
            const rowQty = Number(row.quantity);
            const deduct = Math.min(remainLoc, rowQty);
            const locOk = await deductLocationStock(tx, row.id, deduct);
            if (locOk === 0) continue;
            remainLoc -= deduct;
          }
        }
        await tx.locationStock.deleteMany({ where: { inventoryId: inventory.id, quantity: { lte: 0 } } });

        // ---- 库存主记录 ----
        const beforeQty = Number(inventory.onHand);
        const afterQty = beforeQty - quantity;
        // P0-1：原子扣减。条件不满足（库存不足或已被并发扣走）时 affected=0，
        // 整个事务回滚，前面扣的批次/货位一并还原。
        const stockOk = await deductOnHand(tx, inventory.id, quantity);
        if (stockOk === 0) {
          throw new AppError(`商品ID=${productId} 库存不足或已被其他单据占用，请刷新后重试`, 400);
        }

        // ---- 流水（备注里写清 FEFO 选了哪些批次）----
        const pickText = picks
          .map((p) => `${p.lotNumber || '无批次'}×${p.qty}`)
          .join('，');
        await tx.inventoryTransaction.create({
          data: {
            txnType: 'OUTBOUND',
            refType: 'OUTBOUND',
            refId: order.id,
            refNo: order.orderNo,
            productId,
            warehouseId,
            quantity: -quantity,
            costPrice: item.costPrice ? Number(item.costPrice) : null,
            beforeQty,
            afterQty,
            remark: `FEFO 扣减：${pickText}｜IP: ${ip}`,
          },
        });

        picksByItem.set(String(item.id), picks);
      }

      await tx.operationLog.create({
        data: {
          userId, module: 'OUTBOUND', action: 'POST', refType: 'OUTBOUND', refId: order.id,
          content: `出库单 ${order.orderNo} 已过账（FEFO 选批），扣减库存`, ip,
        },
      });

      await tx.outboundOrder.update({
        where: { id },
        data: { status: 'POSTED', postedAt: new Date() },
      });
    });

    const updatedOrder = await prisma.outboundOrder.findUnique({
      where: { id },
      include: { outboundItems: true, warehouse: true },
    });

    void emitWebhook('outbound.posted', {
      orderId: String(id),
      orderNo: updatedOrder?.orderNo,
      items: (updatedOrder?.outboundItems || []).length,
      picks: [...picksByItem.entries()].flatMap(([itemId, picks]) =>
        picks.map((p) => ({ itemId, lotNumber: p.lotNumber, quantity: p.qty }))
      ),
    });

    const summary = [...picksByItem.values()].flat();

    return NextResponse.json(
      serializeBigInt({
        success: true,
        data: updatedOrder,
        picks: summary,
        message: `出库单已过账，按 FEFO 扣减 ${summary.length} 个批次`,
      })
    );
  } catch (error: any) {
    return handleApiError(error);
  }
}
