'use client';


import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Tag, Typography, message } from 'antd';
import { PlusOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import SearchBar from '@/components/ui/SearchBar';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import ActionButtons from '@/components/ui/ActionButtons';

const { Title } = Typography;

const filterFields = [
  { name: 'keyword', label: 'BOM编号/产品', type: 'input' as const },
  { name: 'status', label: '状态', type: 'select' as const, options: [
    { label: '启用', value: 'active' },
    { label: '草稿', value: 'draft' },
    { label: '停用', value: 'inactive' },
  ]},
];

export default function BomPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchValues, setSearchValues] = useState<Record<string, string>>({});

  const fetchData = useCallback(async (page = current, size = pageSize, search = searchValues) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(size) });
      if (search.keyword) params.set('keyword', search.keyword);
      if (search.status) params.set('status', search.status);
      
      const res = await fetch(`/api/bom?${params}`);
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: 'BOM编号', dataIndex: 'bomNo', key: 'bomNo', width: 120, render: (t: string) => <span style={{ fontFamily: 'monospace', fontWeight: 500, color: '#1976D2' }}>{t}</span> },
    { title: '产品', key: 'product', width: 200, render: (_, r) => (
      <div>
        <div style={{ fontWeight: 500 }}>{(r as any).product?.name || '-'}</div>
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{(r as any).product?.code || '-'}</div>
      </div>
    )},
    { title: '版本', dataIndex: 'version', key: 'version', width: 80, render: (t: string) => <Tag>{t || 'v1.0'}</Tag> },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => <StatusBadge status={s as any || 'active'} /> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
    {
      title: '操作', key: 'action', width: 180,
      render: (_, r) => (
        <ActionButtons
          actions={[
            { key: 'view', label: '查看', icon: <EyeOutlined />, onClick: () => router.push(`/bom/${r.id}`) },
            { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => router.push(`/bom/${r.id}?edit=true`) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>BOM管理</h4>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push('/bom/new')}>新建BOM</Button>
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
