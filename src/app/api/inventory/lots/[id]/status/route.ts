import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * POST /api/inventory/lots/[id]/status  { action: 'freeze' | 'unfreeze' }
 *
 * v1.2 库存冻结：盘点 / 质检 / 争议订单场景，把某个批次冻结起来，
 * 冻结的批量会从「可用量」里扣掉（写入 inventory.locked），
 * 避免出库时被误占用。解冻时原样退回。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req);
  try {
    const uid = (auth as any)?.session?.user?.id;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (action !== 'freeze' && action !== 'unfreeze') {
      return NextResponse.json({ success: false, error: 'action 只能是 freeze 或 unfreeze' }, { status: 400 });
    }

    const lotId = BigInt(params.id);
    const lot = await prisma.inventoryLot.findUnique({
      where: { id: lotId },
      include: { product: { select: { code: true, name: true } } },
    });
    if (!lot) return NextResponse.json({ success: false, error: '批次不存在' }, { status: 404 });

    const qty = Number(lot.quantity || 0);
    const isFrozen = lot.status === 2;

    if (action === 'freeze' && isFrozen) {
      return NextResponse.json({ success: false, error: '该批次已处于冻结状态' }, { status: 400 });
    }
    if (action === 'unfreeze' && !isFrozen) {
      return NextResponse.json({ success: false, error: '该批次未被冻结' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.inventoryLot.update({
        where: { id: lotId },
        data: { status: action === 'freeze' ? 2 : 1 },
      });

      // 同步库存锁定量：冻结时加锁、解冻时释放（不低于 0，且不超过在手量）
      const inv = await tx.inventory.findFirst({
        where: { productId: lot.productId, warehouseId: lot.warehouseId },
      });
      if (inv) {
        const curLocked = Number(inv.locked || 0);
        const onHand = Number(inv.onHand || 0);
        const nextLocked =
          action === 'freeze'
            ? Math.min(onHand, curLocked + qty)
            : Math.max(0, curLocked - qty);
        await tx.inventory.update({
          where: { id: inv.id },
          data: { locked: nextLocked, version: { increment: 1 } },
        });
      }
      return { qty, lotNumber: lot.lotNumber };
    });

    await writeLog({
      module: 'inventory',
      action: action === 'freeze' ? 'freeze' : 'unfreeze',
      userId: uid,
      ip: getClientIp(),
      content: `${action === 'freeze' ? '冻结' : '解冻'}批次 ${result.lotNumber}（${lot.product.name} 数量 ${result.qty}）`,
      refType: 'lot',
      refId: lot.id,
    });

    return NextResponse.json(serializeBigInt({ success: true, data: { lotNumber: result.lotNumber, frozen: action === 'freeze' } }));
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || '操作失败' }, { status: 500 });
  }
}
