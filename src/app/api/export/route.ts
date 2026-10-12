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
        const orders = await prisma.transferOrder.findMany({
          include: { _count: { select: { transferItems: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const warehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } });
        const whMap = new Map<bigint, string>();
        for (const w of warehouses) whMap.set(w.id, w.name);
        const transferStatusMap: Record<string, string> = { DRAFT: '草稿', SENT: '已发出', RECEIVED: '已收货', CANCELLED: '已取消' };

        headers = ['调拨单号', '源仓库', '目标仓库', '商品项数', '状态', '创建时间'];
        rows = orders.map(o => [
          o.orderNo,
          whMap.get(o.fromWhId) || String(o.fromWhId),
          whMap.get(o.toWhId) || String(o.toWhId),
          (o._count?.transferItems ?? 0),
          o.status ? (transferStatusMap[o.status] || o.status) : '',
          o.createdAt ? new Date(o.createdAt).toLocaleString('zh-CN') : '',
        ]);
        fileName = '调拨记录';
        break;
      }

      case 'STOCKTAKE': {
        const orders = await prisma.countOrder.findMany({
          include: {
            warehouse: { select: { name: true } },
            _count: { select: { countItems: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        const stocktakeTypeMap: Record<string, string> = { FULL: '全盘', PARTIAL: '抽盘', CYCLE: '循环盘点' };
        const stocktakeStatusMap: Record<string, string> = { DRAFT: '草稿', COUNTING: '盘点中', ADJUSTED: '已调整', CANCELLED: '已取消' };

        headers = ['盘点单号', '仓库', '类型', '商品项数', '状态', '创建时间'];
        rows = orders.map(o => [
          o.orderNo,
          o.warehouse?.name || '',
          o.type ? (stocktakeTypeMap[o.type] || o.type) : '',
          (o._count?.countItems ?? 0),
          o.status ? (stocktakeStatusMap[o.status] || o.status) : '',
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
        const txns = await prisma.inventoryTransaction.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10000,
        });
        const products = await prisma.product.findMany({ select: { id: true, code: true, name: true } });
        const prodMap = new Map<bigint, { code: string; name: string }>();
        for (const p of products) prodMap.set(p.id, { code: p.code, name: p.name });
        const warehouses = await prisma.warehouse.findMany({ select: { id: true, name: true } });
        const whMap = new Map<bigint, string>();
        for (const w of warehouses) whMap.set(w.id, w.name);
        const txnTypeMap: Record<string, string> = { INBOUND: '入库', OUTBOUND: '出库', TRANSFER: '调拨', ADJUST: '调整', LOCK: '锁定', UNLOCK: '解锁' };

        headers = ['类型', '单号', '商品编码', '商品名称', '仓库', '批次号', '数量', '成本价', '变动前', '变动后', '备注', '时间'];
        rows = txns.map(t => [
          t.txnType ? (txnTypeMap[t.txnType] || t.txnType) : '',
          t.refNo || '',
          prodMap.get(t.productId)?.code || '',
          prodMap.get(t.productId)?.name || '',
          whMap.get(t.warehouseId) || '',
          t.lotNumber || '',
          Number(t.quantity || 0),
          t.costPrice ? Number(t.costPrice).toFixed(2) : '',
          Number(t.beforeQty || 0),
          Number(t.afterQty || 0),
          t.remark || '',
          t.createdAt ? new Date(t.createdAt).toLocaleString('zh-CN') : '',
        ]);
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
