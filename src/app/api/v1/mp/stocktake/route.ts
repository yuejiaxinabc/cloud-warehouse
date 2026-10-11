import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';
import { StocktakeService } from '@/services/stocktake.service';

/**
 * 小程序盘点接口（状态机与 Web 端一致：DRAFT →开始→ COUNTING →结算→ ADJUSTED）
 * GET   /api/v1/mp/stocktake?id=1     盘点单详情（含明细）
 * GET   /api/v1/mp/stocktake?page=1   盘点单列表
 * POST  /api/v1/mp/stocktake          创建盘点单 { warehouseId, remark? }
 * POST  /api/v1/mp/stocktake          开始盘点   { action: 'start', orderId }
 * PATCH /api/v1/mp/stocktake          保存盘点数据 { orderId, itemId, countQty, remark? }（走 enterCount，自动 DRAFT→COUNTING）
 * PUT   /api/v1/mp/stocktake          结算盘点   { orderId }（仅 COUNTING 可结算，与 Web 一致）
 */
export async function GET(req: NextRequest) {
  try {
    await requireMpToken(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 15;

    if (id) {
      const order = await prisma.countOrder.findUnique({
        where: { id: Number(id) },
        include: {
          warehouse: { select: { name: true, code: true } },
          countItems: { include: { product: { select: { id: true, name: true, code: true } } }, orderBy: { id: 'asc' } },
        },
      });
      if (!order) return NextResponse.json({ success: false, error: '盘点单不存在' }, { status: 404 });
      return NextResponse.json(serializeBigInt({ success: true, data: order }));
    }

    const [items, total] = await Promise.all([
      prisma.countOrder.findMany({
        include: {
          warehouse: { select: { name: true, code: true } },
          countItems: { select: { id: true, countQty: true, diffQty: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' },
      }),
      prisma.countOrder.count({}),
    ]);

    const data = items.map((o: any) => ({
      ...o,
      itemCount: o.countItems.length,
      countedCount: o.countItems.filter((i: any) => i.countQty !== null && i.countQty !== undefined).length,
      countItems: undefined,
    }));

    return NextResponse.json(serializeBigInt({ success: true, data: { items: data, total, page, pageSize } }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireMpToken(req);
    const body = await req.json();

    // 开始盘点：DRAFT → COUNTING（与 Web「开始盘点」一致）
    if (body.action === 'start') {
      if (!body.orderId) {
        return NextResponse.json({ success: false, error: '缺少盘点单ID' }, { status: 400 });
      }
      const result = await StocktakeService.start(Number(body.orderId));
      return NextResponse.json(serializeBigInt({ success: true, data: result, message: '盘点已开始' }));
    }

    // 创建盘点单
    const { warehouseId, remark } = body;
    if (!warehouseId) {
      return NextResponse.json({ success: false, error: '仓库为必填' }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const count = await prisma.countOrder.count({ where: { orderNo: { startsWith: 'PD' + dateStr } } });
    const orderNo = 'PD' + dateStr + '-' + String(count + 1).padStart(4, '0');

    const inventories = await prisma.inventory.findMany({
      where: { warehouseId: Number(warehouseId), onHand: { gt: 0 } },
    });

    const order = await prisma.countOrder.create({
      data: {
        orderNo,
        type: 'FULL',
        warehouseId: Number(warehouseId),
        status: 'DRAFT',
        remark: remark || '小程序盘点',
        countItems: {
          create: inventories.map((inv) => ({
            productId: Number(inv.productId),
            systemQty: Number(inv.onHand),
            countQty: null,
            diffQty: null,
          })),
        },
      },
      include: { countItems: true, warehouse: { select: { name: true } } },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: { id: Number(order.id), orderNo: order.orderNo, status: order.status, itemCount: order.countItems.length, warehouseName: order.warehouse?.name },
      message: `盘点单创建成功，共 ${order.countItems.length} 个商品待盘`,
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireMpToken(req);
    const body = await req.json();
    const { orderId, itemId, countQty, remark } = body;
    if (!orderId || !itemId || countQty === undefined || countQty === null) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }
    const qty = Number(countQty);
    if (qty < 0) {
      return NextResponse.json({ success: false, error: '实盘数量不能为负' }, { status: 400 });
    }

    // 走与 Web 相同的 enterCount：校验状态 + 自动 DRAFT→COUNTING + 计算 diff
    await StocktakeService.enterCount(Number(orderId), [{ id: Number(itemId), countQty: qty, remark }]);

    const item = await prisma.countItem.findUnique({ where: { id: Number(itemId) }, select: { countQty: true, diffQty: true } });
    return NextResponse.json(serializeBigInt({
      success: true,
      data: { id: Number(itemId), countQty: Number(item.countQty), diffQty: Number(item.diffQty) },
    }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireMpToken(req);
    const body = await req.json();
    const { orderId } = body;
    if (!orderId) {
      return NextResponse.json({ success: false, error: '缺少盘点单ID' }, { status: 400 });
    }

    const order = await prisma.countOrder.findUnique({
      where: { id: Number(orderId) },
      include: { countItems: true },
    });
    if (!order) return NextResponse.json({ success: false, error: '盘点单不存在' }, { status: 404 });

    // 与 Web 一致：仅 COUNTING 状态可结算（settle 内部同样校验）
    if (order.status !== 'COUNTING') {
      return NextResponse.json({ success: false, error: '请先开始盘点并录入实盘数量后再结算' }, { status: 400 });
    }

    const uncounted = order.countItems.filter((i) => i.countQty === null || i.countQty === undefined).length;
    if (uncounted > 0) {
      return NextResponse.json({ success: false, error: `还有 ${uncounted} 个商品未录入实盘数量` }, { status: 400 });
    }

    const result = await StocktakeService.settle(Number(orderId), auth.userId || undefined);
    return NextResponse.json(serializeBigInt({ success: true, data: result, message: '盘点结算完成' }));
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
