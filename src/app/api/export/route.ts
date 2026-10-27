import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-guard';

/**
 * GET /api/export - 导出数据
 */
export async function GET(request: NextRequest) {
    await requireAuth(request);
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return errorResponse('请选择导出类型', 400);
    }

    let headers: string[] = [];
    let rows: any[][] = [];
    let fileName = '';

    switch (type) {
      case 'PRODUCT': {
        const products = await prisma.product.findMany({
          where: { status: 1 },
          include: {
            category: { select: { name: true } },
            unit: { select: { name: true } },
          },
          orderBy: { code: 'asc' },
        });

        headers = ['商品编码', '商品名称', '条码', '分类', '单位', '规格', '品牌', '型号', '成本方法', '安全库存', '默认成本', '售价', '状态'];
        rows = products.map(p => [
          p.code,
          p.name,
          p.barcode || '',
          p.category?.name || '',
          p.unit?.name || '',
          p.spec || '',
          p.brand || '',
          p.model || '',
          p.costMethod || 'WEIGHTED',
          p.safetyStock ? Number(p.safetyStock) : 0,
          p.defaultCost ? Number(p.defaultCost).toFixed(2) : '',
          p.salePrice ? Number(p.salePrice).toFixed(2) : '',
          p.status === 1 ? '启用' : '停用',
        ]);
        fileName = '商品列表';
        break;
      }

      case 'INVENTORY': {
        const inventories = await prisma.inventory.findMany({
          where: { onHand: { gt: 0 } },
          include: {
            product: { select: { code: true, name: true, spec: true, brand: true } },
            warehouse: { select: { name: true, code: true } },
          },
          orderBy: { productId: 'asc' },
        });

        // 获取货位信息
        const locationStocks = await prisma.locationStock.findMany({
          where: { inventoryId: { in: inventories.map(i => i.id) } },
          include: { location: { select: { code: true } } },
        });
        const locationMap = new Map<string, string>();
        for (const ls of locationStocks) {
          const key = ls.inventoryId.toString();
          const existing = locationMap.get(key) || '';
          locationMap.set(key, existing ? `${existing}, ${ls.location.code}` : ls.location.code);
        }

        headers = ['商品编码', '商品名称', '规格', '品牌', '仓库', '仓库编码', '货位', '在手量', '平均成本', '库存金额'];
        rows = inventories.map(inv => {
          const onHand = Number(inv.onHand || 0);
          const avgCost = inv.avgCost ? Number(inv.avgCost) : 0;
          return [
            inv.product.code,
            inv.product.name,
            inv.product.spec || '',
            inv.product.brand || '',
            inv.warehouse.name,
            inv.warehouse.code,
            locationMap.get(inv.id.toString()) || '',
            onHand,
            avgCost.toFixed(2),
            (onHand * avgCost).toFixed(2),
          ];
        });
        fileName = '库存明细';
        break;
      }

      case 'INBOUND': {
        const orders = await prisma.inboundOrder.findMany({
          include: {
            supplier: { select: { name: true } },
            warehouse: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['入库单号', '类型', '供应商', '仓库', '总数量', '总金额', '状态', '创建时间'];
        rows = orders.map(o => [
          o.orderNo,
          o.type,
          o.supplier?.name || '',
          o.warehouse?.name || String(o.warehouseId),
          Number(o.totalQty || 0),
          Number(o.totalAmount || 0).toFixed(2),
          o.status,
          o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
        ]);
        fileName = '入库记录';
        break;
      }

      case 'OUTBOUND': {
        const orders = await prisma.outboundOrder.findMany({
          include: {
            customer: { select: { name: true } },
            warehouse: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['出库单号', '类型', '客户', '仓库', '领用人', '使用部门', '总数量', '总金额', '状态', '创建时间'];
        rows = orders.map(o => [
          o.orderNo,
          o.type,
          o.customer?.name || '',
          o.warehouse?.name || String(o.warehouseId),
          o.recipientName || '',
          o.department || '',
          Number(o.totalQty || 0),
          Number(o.totalAmount || 0).toFixed(2),
          o.status,
          o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
        ]);
        fileName = '出库记录';
        break;
      }

      case 'TRANSFER': {
        // FIX-2026-1015：TransferOrder 上没有 fromWarehouse/toWarehouse 关系，
        // 也没有 totalQty 字段，原写法直接触发 Prisma 校验错误（请求参数格式错误）。
        // 改为按 fromWhId/toWhId 单独查仓库名，数量由明细求和。
        const orders = await prisma.transferOrder.findMany({
          include: { transferItems: { select: { quantity: true } } },
          orderBy: { createdAt: 'desc' },
        });

        const whIds = new Set<string>();
        for (const o of orders) {
          if (o.fromWhId) whIds.add(o.fromWhId.toString());
          if (o.toWhId) whIds.add(o.toWhId.toString());
        }
        const whs = whIds.size
          ? await prisma.warehouse.findMany({
              where: { id: { in: Array.from(whIds).map((v) => BigInt(v)) } },
              select: { id: true, name: true },
            })
          : [];
        const whMap = new Map(whs.map((w) => [w.id.toString(), w.name]));

        headers = ['调拨单号', '源仓库', '目标仓库', '品类数', '总数量', '状态', '创建时间'];
        rows = orders.map(o => [
          o.orderNo,
          whMap.get(o.fromWhId?.toString() || '') || '',
          whMap.get(o.toWhId?.toString() || '') || '',
          o.transferItems.length,
          o.transferItems.reduce((s, i) => s + Number(i.quantity || 0), 0),
          o.status,
          o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
        ]);
        fileName = '调拨记录';
        break;
      }

      case 'STOCKTAKE': {
        // FIX-2026-1015：schema 里没有 StocktakeOrder 模型，实际叫 CountOrder。
        // prisma.stocktakeOrder 是 undefined，调用即抛 TypeError（服务器内部错误）。
        const orders = await prisma.countOrder.findMany({
          include: {
            warehouse: { select: { name: true } },
            countItems: { select: { systemQty: true, countQty: true, diffQty: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        headers = ['盘点单号', '仓库', '类型', '盘点项数', '系统数量', '实盘数量', '差异数量', '状态', '创建时间'];
        rows = orders.map(o => [
          o.orderNo,
          o.warehouse?.name || '',
          o.type || '',
          o.countItems.length,
          o.countItems.reduce((s, i) => s + Number(i.systemQty || 0), 0),
          o.countItems.reduce((s, i) => s + Number(i.countQty || 0), 0),
          o.countItems.reduce((s, i) => s + Number(i.diffQty || 0), 0),
          o.status,
          o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
        ]);
        fileName = '盘点记录';
        break;
      }

      case 'LOCATION': {
        const locations = await prisma.location.findMany({
          include: {
            zone: { select: { name: true, code: true } },
          },
          orderBy: { code: 'asc' },
        });

        headers = ['货位编码', '货位名称', '区域', '区域编码', '类型', '容量', '状态'];
        rows = locations.map(l => [
          l.code,
          l.name || '',
          l.zone?.name || '',
          l.zone?.code || '',
          l.type || 'shelf',
          l.capacity ? Number(l.capacity) : '',
          l.status === 1 ? '启用' : '停用',
        ]);
        fileName = '货位列表';
        break;
      }

      case 'WAREHOUSE': {
        const warehouses = await prisma.warehouse.findMany({
          orderBy: { code: 'asc' },
        });

        headers = ['仓库编码', '仓库名称', '地址', '联系人', '电话', '状态'];
        rows = warehouses.map(w => [
          w.code,
          w.name,
          w.address || '',
          w.contact || '',
          w.phone || '',
          w.status === 1 ? '启用' : '停用',
        ]);
        fileName = '仓库列表';
        break;
      }

      case 'TRANSACTION': {
        // FIX-2026-1015：InventoryTransaction 只有 productId/warehouseId 标量，
        // 没有 product/warehouse 关系，include 会触发 Prisma 校验错误。
        // 改为先取流水，再批量查名称映射。
        const txns = await prisma.inventoryTransaction.findMany({
          orderBy: { txnTime: 'desc' },
          take: 10000,
        });

        const pIds = Array.from(new Set(txns.map(t => t.productId.toString())));
        const wIds = Array.from(new Set(txns.map(t => t.warehouseId.toString())));
        const [prodList, whList] = await Promise.all([
          pIds.length
            ? prisma.product.findMany({ where: { id: { in: pIds.map(v => BigInt(v)) } }, select: { id: true, code: true, name: true } })
            : Promise.resolve([] as any[]),
          wIds.length
            ? prisma.warehouse.findMany({ where: { id: { in: wIds.map(v => BigInt(v)) } }, select: { id: true, name: true } })
            : Promise.resolve([] as any[]),
        ]);
        const prodMap = new Map(prodList.map((p: any) => [p.id.toString(), p]));
        const whNameMap = new Map(whList.map((w: any) => [w.id.toString(), w.name]));

        headers = ['类型', '单号', '商品编码', '商品名称', '仓库', '批次号', '数量', '成本价', '变动前', '变动后', '备注', '时间'];
        rows = txns.map(t => {
          const p = prodMap.get(t.productId.toString());
          return [
            t.txnType,
            t.refNo || '',
            p?.code || '',
            p?.name || '',
            whNameMap.get(t.warehouseId.toString()) || '',
            t.lotNumber || '',
            Number(t.quantity || 0),
            t.costPrice ? Number(t.costPrice).toFixed(2) : '',
            Number(t.beforeQty || 0),
            Number(t.afterQty || 0),
            t.remark || '',
            t.txnTime ? new Date(t.txnTime).toLocaleString('zh-CN') : '',
          ];
        });
        fileName = '库存流水';
        break;
      }

      default:
        return errorResponse('不支持的导出类型', 400);
    }

    return successResponse({ headers, rows, fileName, total: rows.length });
  } catch (error) {
    return handleApiError(error);
  }
}
