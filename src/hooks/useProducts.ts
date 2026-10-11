'use client';

import { useState, useCallback } from 'react';

/** 商品查询参数 */
interface ProductQuery {
  keyword?: string;
  categoryId?: string;
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

/** 商品记录 */
interface Product {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  type: string;
  status: 'active' | 'inactive';
  stockQty: number;
  safetyStock: number;
  barcode: string;
  brand: string;
  createdAt: string;
}

interface UseProductsReturn {
  data: Product[];
  loading: boolean;
  total: number;
  current: number;
  pageSize: number;
  fetchProducts: (query?: ProductQuery) => Promise<void>;
  createProduct: (values: Record<string, unknown>) => Promise<boolean>;
  updateProduct: (id: string, values: Record<string, unknown>) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<boolean>;
  batchUpdateStatus: (ids: string[], status: string) => Promise<boolean>;
}

/** 演示数据 */
const mockProducts: Product[] = [
  {
    id: '1', sku: 'SKU-001', name: '高端蓝牙耳机', categoryId: 'accessories', categoryName: '配件',
    unit: '个', type: 'finished', status: 'active', stockQty: 500, safetyStock: 100,
    barcode: '6901234567890', brand: '品牌A', createdAt: '2024-01-15',
  },
  {
    id: '2', sku: 'SKU-002', name: '无线充电器', categoryId: 'accessories', categoryName: '配件',
    unit: '个', type: 'finished', status: 'active', stockQty: 300, safetyStock: 50,
    barcode: '6901234567891', brand: '品牌B', createdAt: '2024-02-20',
  },
  {
    id: '3', sku: 'SKU-003', name: '手机保护壳', categoryId: 'accessories', categoryName: '配件',
    unit: '个', type: 'finished', status: 'inactive', stockQty: 0, safetyStock: 200,
    barcode: '6901234567892', brand: '品牌A', createdAt: '2024-03-10',
  },
  {
    id: '4', sku: 'SKU-004', name: 'USB数据线', categoryId: 'accessories', categoryName: '配件',
    unit: '条', type: 'finished', status: 'active', stockQty: 1000, safetyStock: 300,
    barcode: '6901234567893', brand: '品牌C', createdAt: '2024-04-05',
  },
  {
    id: '5', sku: 'SKU-005', name: '笔记本支架', categoryId: 'accessories', categoryName: '配件',
    unit: '个', type: 'finished', status: 'active', stockQty: 200, safetyStock: 50,
    barcode: '6901234567894', brand: '品牌B', createdAt: '2024-05-12',
  },
];

/** 商品 CRUD Hook */
const useProducts = (): UseProductsReturn => {
  const [data, setData] = useState<Product[]>(mockProducts);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(mockProducts.length);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchProducts = useCallback(async (query?: ProductQuery) => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      let filtered = [...mockProducts];
      if (query?.keyword) {
        filtered = filtered.filter(
          (p) => p.name.includes(query.keyword!) || p.sku.includes(query.keyword!)
        );
      }
      if (query?.status) {
        filtered = filtered.filter((p) => p.status === query.status);
      }
      setData(filtered);
      setTotal(filtered.length);
      if (query?.page) setCurrent(query.page);
      if (query?.pageSize) setPageSize(query.pageSize);
    } finally {
      setLoading(false);
    }
  }, []);

  const createProduct = useCallback(async (values: Record<string, unknown>) => {
    console.log('创建商品', values);
    return true;
  }, []);

  const updateProduct = useCallback(async (id: string, values: Record<string, unknown>) => {
    console.log('更新商品', id, values);
    return true;
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    console.log('删除商品', id);
    return true;
  }, []);

  const batchUpdateStatus = useCallback(async (ids: string[], status: string) => {
    console.log('批量更新状态', ids, status);
    return true;
  }, []);

  return { data, loading, total, current, pageSize, fetchProducts, createProduct, updateProduct, deleteProduct, batchUpdateStatus };
};

export default useProducts;
