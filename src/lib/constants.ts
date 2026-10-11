/**
 * 业务常量定义
 */

/** 单据状态 */
export const ORDER_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  LOCKED: 'LOCKED',
  POSTED: 'POSTED',
  SENT: 'SENT',
  RECEIVED: 'RECEIVED',
  COUNTING: 'COUNTING',
  ADJUSTED: 'ADJUSTED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

/** 入库单类型 */
export const INBOUND_TYPE = {
  PURCHASE: 'PURCHASE',   // 采购入库
  RETURN: 'RETURN',       // 退货入库
  TRANSFER: 'TRANSFER',   // 调拨入库
  OTHER: 'OTHER',         // 其他入库
} as const;

/** 出库单类型 */
export const OUTBOUND_TYPE = {
  SALE: 'SALE',           // 销售出库
  RETURN: 'RETURN',       // 退货出库
  TRANSFER: 'TRANSFER',   // 调拨出库
  OTHER: 'OTHER',         // 其他出库
} as const;

/** 库存事务类型 */
export const TXN_TYPE = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
  TRANSFER: 'TRANSFER',
  ADJUST: 'ADJUST',
  LOCK: 'LOCK',
  UNLOCK: 'UNLOCK',
} as const;

/** 成本核算方法 */
export const COST_METHOD = {
  WEIGHTED: 'WEIGHTED',   // 移动加权平均
  FIFO: 'FIFO',           // 先进先出
  MONTHLY: 'MONTHLY',     // 月度加权平均
} as const;

/** 预警类型 */
export const ALERT_TYPE = {
  LOW_STOCK: 'LOW_STOCK',
  OVERSTOCK: 'OVERSTOCK',
  EXPIRY: 'EXPIRY',
  REORDER: 'REORDER',
} as const;

/** 预警级别 */
export const ALERT_LEVEL = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;

/** 审批状态 */
export const APPROVAL_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

/** 盘点类型 */
export const COUNT_TYPE = {
  FULL: 'FULL',         // 全盘
  PARTIAL: 'PARTIAL',   // 部分盘点
  CYCLE: 'CYCLE',       // 循环盘点
} as const;

/** 序列号状态 */
export const SERIAL_STATUS = {
  IN_STOCK: 'IN_STOCK',
  SOLD: 'SOLD',
  RETURNED: 'RETURNED',
  SCRAPPED: 'SCRAPPED',
} as const;

/** 导出任务状态 */
export const EXPORT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

/** 报表类型 */
export const REPORT_TYPE = {
  STOCK_MOVEMENT: 'STOCK_MOVEMENT',  // 收发存报表
  TURNOVER: 'TURNOVER',              // 周转率报表
  AGING: 'AGING',                    // 呆滞分析
} as const;

/** 默认分页大小 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 单据状态标签映射 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  PENDING: '待审核',
  APPROVED: '已通过',
  LOCKED: '已锁定',
  POSTED: '已过账',
  SENT: '已发货',
  RECEIVED: '已收货',
  COUNTING: '盘点中',
  ADJUSTED: '已调整',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
  draft: '草稿',
  pending: '待审核',
  approved: '已通过',
  posted: '已过账',
  in_progress: '进行中',
  diff_confirmed: '差异确认',
  settled: '已结算',
  in_transit: '在途',
  active: '启用',
  inactive: '停用',
};

/** 单据状态颜色映射 */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'orange',
  APPROVED: 'blue',
  LOCKED: 'purple',
  POSTED: 'green',
  SENT: 'cyan',
  RECEIVED: 'green',
  COUNTING: 'processing',
  ADJUSTED: 'warning',
  CLOSED: 'default',
  CANCELLED: 'red',
  draft: 'default',
  pending: 'orange',
  approved: 'blue',
  posted: 'green',
  in_progress: 'processing',
  diff_confirmed: 'warning',
  settled: 'green',
  in_transit: 'orange',
  active: 'green',
  inactive: 'red',
};

/** 商品类型标签 */
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  finished: '成品',
  semi: '半成品',
  raw: '原材料',
  spare: '备品备件',
};

/** 入库类型标签 */
export const STOCK_IN_TYPE_LABELS: Record<string, string> = {
  purchase: '采购入库',
  return: '退货入库',
  production: '生产入库',
  transfer: '调拨入库',
  other: '其他入库',
};

/** 出库类型标签 */
export const STOCK_OUT_TYPE_LABELS: Record<string, string> = {
  sale: '销售出库',
  pick: '领料出库',
  return: '退货出库',
  transfer: '调拨出库',
  other: '其他出库',
};

/** 盘点类型标签 */
export const STOCKTAKE_TYPE_LABELS: Record<string, string> = {
  periodic: '定期盘点',
  cycle: '循环盘点',
  random: '抽盘',
};

/** 调拨状态标签 */
export const TRANSFER_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  approved: '已审批',
  in_transit: '在途',
  received: '已收货',
  cancelled: '已取消',
};
