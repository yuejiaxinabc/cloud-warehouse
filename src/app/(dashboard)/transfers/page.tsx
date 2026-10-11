'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Typography, message } from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import SearchBar from '@/components/ui/SearchBar';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import ActionButtons from '@/components/ui/ActionButtons';

const { Title } = Typography;

const filterFields = [
  { name: 'orderNo', label: '单号', type: 'input' as const },
  { name: 'status', label: '状态', type: 'select' as const, options: [
    { label: '草稿', value: 'DRAFT' },
    { label: '已批准', value: 'APPROVED' },
    { label: '已发运', value: 'SHIPPED' },
    { label: '已完成', value: 'COMPLETED' },
  ]},
];

const statusMap: Record<string, string> = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
};

export default function TransfersPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchValues, setSearchValues] = useState<Record<string, string>>({});

  const fetchData = useCallback(async (page = current, size = pageSize, search = searchValues) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(size) });
      if (search.orderNo) params.set('orderNo', search.orderNo);
      if (search.status) params.set('status', search.status);
      
      const res = await fetch(`/api/transfers?${params}`);
      const json = await res.json();
      if (json.code === 0) {
        setData(json.data?.list || json.data?.items || []);
        setTotal(json.data?.total || 0);
      } else {
        message.error(json.message || '加载失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize, searchValues]);

  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '单号', dataIndex: 'orderNo', key: 'orderNo', width: 180, render: (t: string) => <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#1976D2' }}>{t}</span> },
    { title: '源仓库', key: 'sourceWarehouse', width: 100, render: (_, r) => (r as any).fromWarehouse?.name || '-' },
    { title: '目的仓库', key: 'targetWarehouse', width: 100, render: (_, r) => (r as any).toWarehouse?.name || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (s: string) => <StatusBadge status={statusMap[s] as any || 'draft'} /> },
    { title: '总数量', key: 'totalQty', width: 90, render: (_, r) => {
      const items = (r as any).transferItems || [];
      const total = items.reduce((sum: number, i: any) => sum + Number(i.quantity || 0), 0);
      return <span style={{ fontWeight: 600 }}>{total}</span>;
    }},
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
    {
      title: '操作', key: 'action', width: 100,
      render: (_, r) => (
        <ActionButtons actions={[
          { key: 'view', label: '查看', icon: <EyeOutlined />, onClick: () => router.push(`/transfers/${r.id}`) },
        ]} />
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>调拨管理</h4>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/transfers/new')}>新建调拨单</Button>
      </div>
      <SearchBar fields={filterFields} onSearch={(v) => { setSearchValues(v); setCurrent(1); fetchData(1, pageSize, v); }} />
      <Card styles={{ body: { padding: 0 } }}>
        <DataTable
          columns={columns}
          dataSource={data}
          loading={loading}
          current={current}
          pageSize={pageSize}
          total={total}
          onChange={(page, size) => { setCurrent(page); setPageSize(size); fetchData(page, size); }}
        />
      </Card>
    </div>
  );
}
