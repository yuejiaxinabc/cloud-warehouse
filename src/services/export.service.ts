import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * 导出服务
 * 通用 Excel 导出
 */
export class ExportService {
  /**
   * 创建导出任务
   */
  static async createTask(data: {
    type: string;
    params?: Record<string, any>;
    userId?: number;
  }) {
    const task = await prisma.exportTask.create({
      data: {
        type: data.type,
        status: 'PENDING',
        params: data.params ? data.params as Prisma.InputJsonValue : undefined,
        userId: data.userId,
      },
    });

    // 异步处理导出（实际项目中应使用 BullMQ 队列）
    // 这里直接同步执行
    try {
      await this.processTask(Number(task.id));
    } catch (error) {
      console.error('导出任务处理失败:', error);
    }

    return task;
  }

  /**
   * 查询导出任务列表
   */
  static async listTasks(params: {
    page: number;
    pageSize: number;
    userId?: number;
    type?: string;
    status?: string;
  }) {
    const { page, pageSize, userId, type, status } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ExportTaskWhereInput = {};
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (status) where.status = status;

    const [list, total] = await Promise.all([
      prisma.exportTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.exportTask.count({ where }),
    ]);

    return {
      list: list.map((t) => ({
        ...t,
        id: Number(t.id),
        userId: t.userId ? Number(t.userId) : null,
        params: t.params as any,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 处理导出任务
   */
  private static async processTask(taskId: number) {
    const task = await prisma.exportTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    await prisma.exportTask.update({
      where: { id: taskId },
      data: { status: 'PROCESSING' },
    });

    try {
      let data: any[] = [];
      let headers: string[] = [];
      let fileName = '';

      const params = (task.params as any) || {};

      switch (task.type) {
        case 'PRODUCT':
          data = await this.exportProducts(params);
          headers = ['商品编码', '商品名称', '条码', '分类', '单位', '规格', '品牌', '成本方法', '安全库存', '最高库存', '默认成本', '售价', '状态'];
          fileName = '商品列表';
          break;

        case 'INVENTORY':
          data = await this.exportInventory(params);
          headers = ['商品编码', '商品名称', '仓库', '在手量', '锁定量', '可用量', '平均成本', '库存金额'];
          fileName = '库存余额';
          break;

        case 'INBOUND':
          data = await this.exportInbound(params);
          headers = ['入库单号', '类型', '供应商', '仓库', '总数量', '总金额', '状态', '创建时间'];
          fileName = '入库记录';
          break;

        case 'OUTBOUND':
          data = await this.exportOutbound(params);
          headers = ['出库单号', '类型', '客户', '仓库', '总数量', '总金额', '状态', '创建时间'];
          fileName = '出库记录';
          break;

        default:
          throw new Error(`不支持的导出类型: ${task.type}`);
      }

      // 生成 CSV 内容（简化处理，实际项目应使用 xlsx 库）
      const csvContent = [
        headers.join(','),
        ...data.map((row) => headers.map((h) => String(row[h] ?? '')).join(',')),
      ].join('\n');

      const fileUrl = `/exports/${task.type}_${Date.now()}.csv`;

      await prisma.exportTask.update({
        where: { id: taskId },
        data: {
          status: 'COMPLETED',
          fileUrl,
          fileName: `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`,
        },
      });
    } catch (error) {
      await prisma.exportTask.update({
        where: { id: taskId },
        data: {
          status: 'FAILED',
          errorMsg: error instanceof Error ? error.message : '未知错误',
        },
      });
    }
  }

  /** 导出商品数据 */
  private static async exportProducts(params: any) {
    const products = await prisma.product.findMany({
      where: { status: 1 },
      include: {
        category: { select: { name: true } },
        unit: { select: { name: true } },
      },
    });

    return products.map((p) => ({
      '商品编码': p.code,
      '商品名称': p.name,
      '条码': p.barcode || '',
      '分类': p.category?.name || '',
      '单位': p.unit?.name || '',
      '规格': p.spec || '',
      '品牌': p.brand || '',
      '成本方法': p.costMethod,
      '安全库存': p.safetyStock ? Number(p.safetyStock) : '',
      '最高库存': p.maxStock ? Number(p.maxStock) : '',
      '默认成本': p.defaultCost ? Number(p.defaultCost) : '',
      '售价': p.salePrice ? Number(p.salePrice) : '',
      '状态': p.status === 1 ? '启用' : '禁用',
    }));
  }

  /** 导出库存数据 */
  private static async exportInventory(params: any) {
    const where: Prisma.InventoryWhereInput = {};
    if (params.warehouseId) where.warehouseId = params.warehouseId;

    const inventories = await prisma.inventory.findMany({
      where,
      include: {
        product: { select: { code: true, name: true } },
        warehouse: { select: { name: true } },
      },
    });

    return inventories.map((inv) => {
      const onHand = Number(inv.onHand);
      const locked = Number(inv.locked);
      const avgCost = inv.avgCost ? Number(inv.avgCost) : 0;
      return {
        '商品编码': inv.product.code,
        '商品名称': inv.product.name,
        '仓库': inv.warehouse.name,
        '在手量': onHand,
        '锁定量': locked,
        '可用量': onHand - locked,
        '平均成本': avgCost,
        '库存金额': Math.round(onHand * avgCost * 100) / 100,
      };
    });
  }

  /** 导出入库记录 */
  private static async exportInbound(params: any) {
    const where: Prisma.InboundOrderWhereInput = {};
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const orders = await prisma.inboundOrder.findMany({
      where,
      include: {
        supplier: { select: { name: true } },
      },
    });

    return orders.map((o) => ({
      '入库单号': o.orderNo,
      '类型': o.type,
      '供应商': o.supplier?.name || '',
      '仓库': String(o.warehouseId),
      '总数量': o.totalQty ? Number(o.totalQty) : 0,
      '总金额': o.totalAmount ? Number(o.totalAmount) : 0,
      '状态': o.status,
      '创建时间': o.createdAt.toISOString(),
    }));
  }

  /** 导出出库记录 */
  private static async exportOutbound(params: any) {
    const where: Prisma.OutboundOrderWhereInput = {};
    if (params.warehouseId) where.warehouseId = params.warehouseId;
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const orders = await prisma.outboundOrder.findMany({
      where,
      include: {
        customer: { select: { name: true } },
      },
    });

    return orders.map((o) => ({
      '出库单号': o.orderNo,
      '类型': o.type,
      '客户': o.customer?.name || '',
      '仓库': String(o.warehouseId),
      '总数量': o.totalQty ? Number(o.totalQty) : 0,
      '总金额': o.totalAmount ? Number(o.totalAmount) : 0,
      '状态': o.status,
      '创建时间': o.createdAt.toISOString(),
    }));
  }
}
