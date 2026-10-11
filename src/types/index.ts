/**
 * 智能仓储管理平台类型定义
 */

import { Decimal } from '@prisma/client/runtime/library';

// ==================== 通用类型 ====================

/** API 统一响应 */
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 分页查询参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

// ==================== 用户与权限 ====================

export interface UserInfo {
  id: string;
  username: string;
  realName: string;
  email?: string;
  phone?: string;
  orgId?: string;
  roles: string[];
  permissions: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

// ==================== 商品 ====================

export interface ProductListItem {
  id: number;
  name: string;
  code: string;
  barcode?: string;
  category?: { id: number; name: string };
  unit?: { id: number; name: string };
  spec?: string;
  brand?: string;
  model?: string;
  safetyStock?: number;
  maxStock?: number;
  leadTimeDays?: number;
  defaultCost?: number;
  salePrice?: number;
  costMethod: string;
  enableSerial: boolean;
  enableBatch: boolean;
  status: number;
  createdAt: Date;
}

export interface CreateProductRequest {
  name: string;
  code: string;
  barcode?: string;
  categoryId?: number;
  unitId?: number;
  spec?: string;
  specJson?: Record<string, any>;
  brand?: string;
  model?: string;
  weight?: number;
  volume?: number;
  safetyStock?: number;
  maxStock?: number;
  leadTimeDays?: number;
  shelfLifeDays?: number;
  defaultCost?: number;
  salePrice?: number;
  costMethod?: 'WEIGHTED' | 'FIFO' | 'MONTHLY';
  enableSerial?: boolean;
  enableBatch?: boolean;
  remark?: string;
}

// ==================== 库存 ====================

export interface InventoryBalance {
  productId: number;
  productName: string;
  productCode: string;
  warehouseId: number;
  warehouseName: string;
  skuVariantId?: number;
  onHand: number;
  locked: number;
  available: number;
  avgCost?: number;
  totalValue: number; // onHand * avgCost
}

export interface InventoryQueryParams extends PaginationParams {
  warehouseId?: number;
  categoryId?: number;
  keyword?: string;
  lowStockOnly?: boolean;
}

// ==================== 入库 ====================

export interface InboundOrderDetail {
  id: number;
  orderNo: string;
  type: string;
  warehouseId: number;
  warehouseName?: string;
  supplierId?: number;
  supplierName?: string;
  status: string;
  totalAmount?: number;
  totalQty?: number;
  remark?: string;
  postedAt?: Date;
  items: InboundItemDetail[];
  createdAt: Date;
}

export interface InboundItemDetail {
  id: number;
  productId: number;
  productName?: string;
  productCode?: string;
  skuVariantId?: number;
  lotNumber?: string;
  quantity: number;
  receivedQty?: number;
  costPrice?: number;
  amount?: number;
}

export interface CreateInboundRequest {
  type: 'PURCHASE' | 'RETURN' | 'TRANSFER' | 'OTHER';
  warehouseId: number;
  supplierId?: number;
  remark?: string;
  items: {
    productId: number;
    skuVariantId?: number;
    lotNumber?: string;
    quantity: number;
    costPrice?: number;
    remark?: string;
  }[];
}

// ==================== 出库 ====================

export interface OutboundOrderDetail {
  id: number;
  orderNo: string;
  type: string;
  warehouseId: number;
  warehouseName?: string;
  customerId?: number;
  customerName?: string;
  status: string;
  totalAmount?: number;
  totalQty?: number;
  remark?: string;
  lockedAt?: Date;
  postedAt?: Date;
  items: OutboundItemDetail[];
  createdAt: Date;
}

export interface OutboundItemDetail {
  id: number;
  productId: number;
  productName?: string;
  productCode?: string;
  skuVariantId?: number;
  quantity: number;
  pickedQty?: number;
  costPrice?: number;
  amount?: number;
}

export interface CreateOutboundRequest {
  type: 'SALE' | 'RETURN' | 'TRANSFER' | 'OTHER';
  warehouseId: number;
  customerId?: number;
  remark?: string;
  items: {
    productId: number;
    skuVariantId?: number;
    quantity: number;
    remark?: string;
  }[];
}

// ==================== 盘点 ====================

export interface CountOrderDetail {
  id: number;
  orderNo: string;
  warehouseId: number;
  warehouseName?: string;
  type: string;
  status: string;
  remark?: string;
  items: CountItemDetail[];
  createdAt: Date;
}

export interface CountItemDetail {
  id: number;
  productId: number;
  productName?: string;
  skuVariantId?: number;
  systemQty: number;
  countQty?: number;
  diffQty?: number;
  remark?: string;
}

export interface CreateCountRequest {
  warehouseId: number;
  type: 'FULL' | 'PARTIAL' | 'CYCLE';
  remark?: string;
  items: {
    productId: number;
    skuVariantId?: number;
  }[];
}

// ==================== 调拨 ====================

export interface TransferOrderDetail {
  id: number;
  orderNo: string;
  fromWhId: number;
  fromWhName?: string;
  toWhId: number;
  toWhName?: string;
  status: string;
  remark?: string;
  sentAt?: Date;
  receivedAt?: Date;
  items: TransferItemDetail[];
  createdAt: Date;
}

export interface TransferItemDetail {
  id: number;
  productId: number;
  productName?: string;
  skuVariantId?: number;
  quantity: number;
  sentQty?: number;
  receivedQty?: number;
}

export interface CreateTransferRequest {
  fromWhId: number;
  toWhId: number;
  remark?: string;
  items: {
    productId: number;
    skuVariantId?: number;
    quantity: number;
    remark?: string;
  }[];
}

// ==================== BOM ====================

export interface BomDetail {
  id: number;
  name: string;
  code: string;
  productId: number;
  productName?: string;
  version: string;
  status: number;
  items: BomItemDetail[];
  createdAt: Date;
}

export interface BomItemDetail {
  id: number;
  productId: number;
  productName?: string;
  quantity: number;
  wastage?: number;
  remark?: string;
}

export interface CreateBomRequest {
  name: string;
  code: string;
  productId: number;
  version?: string;
  remark?: string;
  items: {
    productId: number;
    quantity: number;
    wastage?: number;
    remark?: string;
  }[];
}

/** 齐套校验结果 */
export interface KitCheckResult {
  isComplete: boolean;
  items: {
    productId: number;
    productName: string;
    required: number;
    available: number;
    shortage: number; // 缺口数量，0表示充足
  }[];
}

// ==================== 预警 ====================

export interface AlertRuleItem {
  id: number;
  name: string;
  type: string;
  targetType: string;
  targetId?: number;
  condition: {
    threshold: number;
    operator: string;
  };
  notifyType: string;
  status: number;
  createdAt: Date;
}

export interface AlertItem {
  id: number;
  ruleId: number;
  ruleName?: string;
  productId?: number;
  productName?: string;
  warehouseId?: number;
  warehouseName?: string;
  level: string;
  title: string;
  content?: string;
  status: string;
  createdAt: Date;
}

// ==================== 报表 ====================

/** 收发存报表行 */
export interface StockMovementRow {
  productId: number;
  productName: string;
  productCode: string;
  warehouseName: string;
  beginQty: number;
  beginAmount: number;
  inQty: number;
  inAmount: number;
  outQty: number;
  outAmount: number;
  endQty: number;
  endAmount: number;
}

/** 周转率报表行 */
export interface TurnoverRow {
  productId: number;
  productName: string;
  productCode: string;
  avgInventory: number;
  totalOutQty: number;
  turnoverRate: number; // 周转率
  turnoverDays: number; // 周转天数
}

/** 呆滞分析行 */
export interface AgingRow {
  productId: number;
  productName: string;
  productCode: string;
  warehouseName: string;
  quantity: number;
  lastInboundDate?: Date;
  lastOutboundDate?: Date;
  idleDays: number; // 呆滞天数
  amount: number;
}

// ==================== 成本 ====================

/** 成本快照 */
export interface CostSnapshotData {
  productId: number;
  productName?: string;
  period: string;
  beginQty: number;
  beginAmount: number;
  inQty: number;
  inAmount: number;
  outQty: number;
  outAmount: number;
  endQty: number;
  endAmount: number;
  avgCost: number;
}

// ==================== 导出 ====================

export interface ExportTaskItem {
  id: number;
  type: string;
  status: string;
  params?: Record<string, any>;
  fileUrl?: string;
  fileName?: string;
  errorMsg?: string;
  createdAt: Date;
}

// ==================== 库存流水 ====================

export interface InventoryTransactionItem {
  id: number;
  txnType: string;
  refType: string;
  refId: number;
  refNo: string;
  productId: number;
  productName?: string;
  warehouseId: number;
  warehouseName?: string;
  lotNumber?: string;
  quantity: number;
  costPrice?: number;
  beforeQty?: number;
  afterQty?: number;
  remark?: string;
  txnTime: Date;
}
