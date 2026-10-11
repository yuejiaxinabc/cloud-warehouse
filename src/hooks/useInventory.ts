'use client';

import { useState, useCallback } from 'react';

/** 库存查询参数 */
interface InventoryQuery {
  productId?: string;
  warehouseId?: string;
  locationId?: string;
  batchNo?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** 库存记录 */
interface InventoryRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  warehouseId: string;
  warehouseName: string;
  locationId: string;
  locationName: string;
  batchNo: string;
  onHandQty: number;
  lockedQty: number;
  availableQty: number;
  avgCost: number;
  totalValue: number;
  lastUpdated: string;
}

/** 库存汇总 */
interface InventorySummary {
  totalQty: number;
  totalValue: number;
  totalSku: number;
  totalWarehouse: number;
}

interface UseInventoryReturn {
  /** 库存列表 */
  data: InventoryRecord[];
  /** 汇总数据 */
  summary: InventorySummary;
  /** 加载状态 */
  loading: boolean;
  /** 总数 */
  total: number;
  /** 当前页 */
  current: number;
  /** 每页条数 */
  pageSize: number;
  /** 查询库存 */
  fetchInventory: (query?: InventoryQuery) => Promise<void>;
  /** 导出库存 */
  exportInventory: (query?: InventoryQuery) => Promise<Blob | void>;
}

/** 演示数据 */
const mockData: InventoryRecord[] = [
  {
    id: '1', productId: 'p1', productName: '商品A', sku: 'SKU-001',
    warehouseId: 'wh1', warehouseName: '主仓库', locationId: 'loc1', locationName: 'A-01-01',
    batchNo: 'BN-20240101', onHandQty: 500, lockedQty: 50, availableQty: 450,
    avgCost: 25.5, totalValue: 12750, lastUpdated: '2024-08-09 10:30:00',
  },
  {
    id: '2', productId: 'p2', productName: '商品B', sku: 'SKU-002',
    warehouseId: 'wh1', warehouseName: '主仓库', locationId: 'loc2', locationName: 'A-01-02',
    batchNo: 'BN-20240201', onHandQty: 300, lockedQty: 0, availableQty: 300,
    avgCost: 18.0, totalValue: 5400, lastUpdated: '2024-08-09 09:15:00',
  },
  {
    id: '3', productId: 'p3', productName: '商品C', sku: 'SKU-003',
    warehouseId: 'wh2', warehouseName: '华东仓', locationId: 'loc3', locationName: 'B-01-01',
    batchNo: 'BN-20240301', onHandQty: 150, lockedQty: 20, availableQty: 130,
    avgCost: 42.0, totalValue: 6300, lastUpdated: '2024-08-08 16:45:00',
  },
];

const mockSummary: InventorySummary = {
  totalQty: 950,
  totalValue: 24450,
  totalSku: 3,
  totalWarehouse: 2,
};

/** 库存查询 Hook */
const useInventory = (): UseInventoryReturn => {
  const [data, setData] = useState<InventoryRecord[]>(mockData);
  const [summary, setSummary] = useState<InventorySummary>(mockSummary);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(mockData.length);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchInventory = useCallback(async (query?: InventoryQuery) => {
    setLoading(true);
    try {
      // 实际项目中调用 API
      // const res = await fetch('/api/inventory?' + new URLSearchParams(query as any));
      // const result = await res.json();
      // setData(result.data);
      // setTotal(result.total);
      // setSummary(result.summary);

      // 模拟延迟
      await new Promise((resolve) => setTimeout(resolve, 500));
      setData(mockData);
      setTotal(mockData.length);
      setSummary(mockSummary);
      if (query?.page) setCurrent(query.page);
      if (query?.pageSize) setPageSize(query.pageSize);
    } finally {
      setLoading(false);
    }
  }, []);

  const exportInventory = useCallback(async (query?: InventoryQuery) => {
    // 实际项目中调用导出 API
    // const res = await fetch('/api/export/inventory', { method: 'POST', body: JSON.stringify(query) });
    // return res.blob();
    console.log('导出库存', query);
  }, []);

  return { data, summary, loading, total, current, pageSize, fetchInventory, exportInventory };
};

export default useInventory;
