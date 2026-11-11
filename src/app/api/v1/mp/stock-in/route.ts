import { getDataScope, withWarehouseScope, withDocumentScope, assertWarehouseAllowed, assertDocumentAllowed } from '@/lib/data-scope';
import { hasPermissionGranted } from '@/lib/auth-guard';
import { ForbiddenError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';
import { StockInService } from '@/services/stock-in.service';

/**
 * POST /api/v1/mp/stock-in - 扫码入库
 * body: { code, quantity, warehouseId, locationId, boxId?, remark? }
 * 自动创建入库单并过账，库存写入指定货位/盒子
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireMpToken(req);
    for (const permission of ["stock_in:create","stock_in:post"]) {
      if (!hasPermissionGranted(auth.user.permissions, permission)) throw new ForbiddenError('缺少业务操作权限');
    }
    const scope = await getDataScope(auth.user);
    const body = await req.json();
    const { code, quantity, warehouseId, locationId, boxId, remark } = body;

    if (!code || !quantity || !warehouseId || !locationId) {
      return NextResponse.json({ success: false, error: '缺少必填参数（编码/数量/仓库/货位）' }, { status: 400 });
    }
    await assertWarehouseAllowed(scope, Number(warehouseId));
    if (boxId) return NextResponse.json({ success: false, error: '扫码入库暂不支持指定盒子，请使用货位入库' }, { status: 400 });
    const qty = Number(quantity);
    if (qty <= 0) {
      return NextResponse.json({ success: false, error: '数量必须大于 0' }, { status: 400 });
    }

    // 查商品：条码/编码/序列号
    let product = await prisma.product.findFirst({
      where: { OR: [{ barcode: code }, { code: code }] },
    });
    if (!product) {
      const serial = await prisma.serialNumber.findFirst({ where: withWarehouseScope({ serialNo: code }, scope) });
      if (serial) {
        product = await prisma.product.findUnique({ where: { id: serial.productId } });
      }
    }
    if (!product) {
      return NextResponse.json({ success: false, error: `未找到编码为 ${code} 的商品` }, { status: 404 });
    }

    // 创建入库单并过账
    const order = await StockInService.create({
      operatorId: Number(auth.user.id),
      type: 'OTHER',
      warehouseId: Number(warehouseId),
      remark: remark || '小程序扫码入库',
      items: [{ productId: Number(product.id), quantity: qty, locationId: Number(locationId) }],
    });
    await StockInService.post(Number(order.id), Number(auth.user.id));

    // StockInService.post is the sole inventory/location writer; never increment twice.
    const boxCode = '';

    return NextResponse.json(serializeBigInt({
      success: true,
      data: { orderNo: order.orderNo, productName: product.name, quantity: qty, boxCode },
      message: `入库成功（${order.orderNo}）`,
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
