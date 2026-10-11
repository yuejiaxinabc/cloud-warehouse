'use client';

import { useState, useCallback } from 'react';

/** 预警记录 */
interface AlertRecord {
  id: string;
  type: string;
  level: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  productName: string;
  productSku: string;
  currentValue: number;
  threshold: number;
  status: 'active' | 'resolved' | 'ignored';
  createdAt: string;
  resolvedAt?: string;
}

/** 预警规则 */
interface AlertRule {
  id: string;
  name: string;
  type: string;
  level: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  notifyMethod: string[];
  createdAt: string;
}

interface UseAlertsReturn {
  alerts: AlertRecord[];
  rules: AlertRule[];
  loading: boolean;
  total: number;
  stats: { high: number; medium: number; low: number };
  fetchAlerts: (query?: Record<string, unknown>) => Promise<void>;
  fetchRules: () => Promise<void>;
  resolveAlert: (id: string) => Promise<boolean>;
  ignoreAlert: (id: string) => Promise<boolean>;
  createRule: (values: Record<string, unknown>) => Promise<boolean>;
  updateRule: (id: string, values: Record<string, unknown>) => Promise<boolean>;
  toggleRule: (id: string, enabled: boolean) => Promise<boolean>;
}

/** 演示数据 */
const mockAlerts: AlertRecord[] = [
  {
    id: '1', type: 'low_stock', level: 'high', title: '库存不足预警',
    message: '商品A (SKU-001) 当前库存低于安全库存',
    productName: '商品A', productSku: 'SKU-001',
    currentValue: 50, threshold: 200, status: 'active', createdAt: '2024-08-09 10:00:00',
  },
  {
    id: '2', type: 'low_stock', level: 'high', title: '库存不足预警',
    message: '商品B (SKU-002) 当前库存低于安全库存',
    productName: '商品B', productSku: 'SKU-002',
    currentValue: 30, threshold: 150, status: 'active', createdAt: '2024-08-09 09:30:00',
  },
  {
    id: '3', type: 'expiring', level: 'medium', title: '临期预警',
    message: '批次 BN-20240101 将于30天后过期',
    productName: '商品C', productSku: 'SKU-003',
    currentValue: 15, threshold: 30, status: 'active', createdAt: '2024-08-08 14:00:00',
  },
  {
    id: '4', type: 'low_turnover', level: 'medium', title: '周转率低预警',
    message: '商品D (SKU-004) 近30天周转率低于阈值',
    productName: '商品D', productSku: 'SKU-004',
    currentValue: 2, threshold: 5, status: 'active', createdAt: '2024-08-07 11:00:00',
  },
  {
    id: '5', type: 'aging', level: 'low', title: '库龄过长预警',
    message: '商品E (SKU-005) 库存超过90天未动',
    productName: '商品E', productSku: 'SKU-005',
    currentValue: 90, threshold: 60, status: 'active', createdAt: '2024-08-06 09:00:00',
  },
];

const mockRules: AlertRule[] = [
  {
    id: '1', name: '库存不足预警', type: 'low_stock', level: 'high',
    condition: '当前库存 < 安全库存', threshold: 0, enabled: true,
    notifyMethod: ['system', 'email'], createdAt: '2024-01-01',
  },
  {
    id: '2', name: '临期预警', type: 'expiring', level: 'medium',
    condition: '保质期剩余 < 30天', threshold: 30, enabled: true,
    notifyMethod: ['system'], createdAt: '2024-01-01',
  },
];

/** 预警数据 Hook */
const useAlerts = (): UseAlertsReturn => {
  const [alerts, setAlerts] = useState<AlertRecord[]>(mockAlerts);
  const [rules, setRules] = useState<AlertRule[]>(mockRules);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(mockAlerts.length);

  const stats = {
    high: alerts.filter((a) => a.level === 'high' && a.status === 'active').length,
    medium: alerts.filter((a) => a.level === 'medium' && a.status === 'active').length,
    low: alerts.filter((a) => a.level === 'low' && a.status === 'active').length,
  };

  const fetchAlerts = useCallback(async (query?: Record<string, unknown>) => {
    setLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setAlerts(mockAlerts);
      setTotal(mockAlerts.length);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRules = useCallback(async () => {
    setRules(mockRules);
  }, []);

  const resolveAlert = useCallback(async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'resolved' as const, resolvedAt: new Date().toISOString() } : a))
    );
    return true;
  }, []);

  const ignoreAlert = useCallback(async (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'ignored' as const } : a))
    );
    return true;
  }, []);

  const createRule = useCallback(async (values: Record<string, unknown>) => {
    console.log('创建规则', values);
    return true;
  }, []);

  const updateRule = useCallback(async (id: string, values: Record<string, unknown>) => {
    console.log('更新规则', id, values);
    return true;
  }, []);

  const toggleRule = useCallback(async (id: string, enabled: boolean) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    return true;
  }, []);

  return { alerts, rules, loading, total, stats, fetchAlerts, fetchRules, resolveAlert, ignoreAlert, createRule, updateRule, toggleRule };
};

export default useAlerts;
