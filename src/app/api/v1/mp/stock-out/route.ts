import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';
import { StockOutService } from '@/services/stock-out.service';

/**
 * POST /api/v1/mp/stock-out - 扫码出库
 * body: { code, quantity, warehouseId?, remark? }
 * 自动创建出库单 → 提交锁定库存 → 过账扣减（FIFO 扣批次）
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireMpToken(req);
    const body = await req.json();
    const { code, quantity, warehouseId, remark } = body;

    if (!code || !quantity) {
      return NextResponse.json({ success: false, error: '缺少必填参数（编码/数量）' }, { status: 400 });
    }
    const qty = Number(quantity);
    if (qty <= 0) {
      return NextResponse.json({ success: false, error: '数量必须大于 0' }, { status: 400 });
    }

    // 查商品：条码/编码/序列号
    let product = await prisma.product.findFirst({
      where: { OR: [{ barcode: code }, { code: code }] },
    });
    if (!product) {
      const serial = await prisma.serialNumber.findFirst({ where: { serialNo: code } });
      if (serial) {
        product = await prisma.product.findUnique({ where: { id: serial.productId } });
      }
    }
    if (!product) {
      return NextResponse.json({ success: false, error: `未找到编码为 ${code} 的商品` }, { status: 404 });
    }

    // 确定出货仓库：指定 > 库存最多的仓库
    const inventories = await prisma.inventory.findMany({
      where: { productId: product.id },
      include: { warehouse: { select: { name: true } } },
    });
    if (inventories.length === 0) {
      return NextResponse.json({ success: false, error: '该商品没有任何库存记录' }, { status: 400 });
    }

    let target = inventories.find((inv) => warehouseId && Number(inv.warehouseId) === Number(warehouseId));
    if (!target) {
      target = inventories.slice().sort((a, b) => Number(b.onHand) - Number(a.onHand))[0];
    }
    const available = Number(target.onHand) - Number(target.locked || 0);
    if (available < qty) {
      return NextResponse.json({
        success: false,
        error: `库存不足：${target.warehouse?.name || ''} 可用 ${available}，需要 ${qty}`,
      }, { status: 400 });
    }

    // 创建出库单 → 提交锁定 → 审批 → 过账（与 Web 端同一状态链）
    const order = await StockOutService.create({
      type: 'OTHER',
      warehouseId: Number(target.warehouseId),
      remark: remark || '小程序扫码出库',
      items: [{ productId: Number(product.id), quantity: qty }],
    });
    await StockOutService.submitForApproval(Number(order.id));
    await StockOutService.approve(Number(order.id), true, auth.userId || 0);
    await StockOutService.post(Number(order.id));

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        orderNo: order.orderNo,
        productName: product.name,
        quantity: qty,
        warehouseName: target.warehouse?.name || '',
        remainStock: available - qty,
      },
      message: `出库成功（${order.orderNo}）`,
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
