'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Typography, message, Button, Space } from 'antd';
import { ImportOutlined, ExportOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import SearchBar from '@/components/ui/SearchBar';
import DataTable from '@/components/ui/DataTable';
import { ExportButton } from '@/components/ui/ExportButton';

const { Title, Text } = Typography;

const filterFields = [
  { name: 'warehouseId', label: '仓库', type: 'select' as const, options: [
    { label: '全部', value: '' },
  ]},
];

export default function ReportSummaryPage() {
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ totalIn: 0, totalOut: 0, totalValue: 0 });
  const [current, setCurrent] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async (page = current, size = pageSize) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ 
        page: String(page), 
        pageSize: String(size),
        type: 'summary'
      });
      const res = await fetch(`/api/reports?${params}`);
      const json = await res.json();
      if (json.code === 0 || json.success) {
        const items = json.data?.items || json.data?.list || [];
        setData(items);
        setTotal(json.data?.total || items.length);
        
        let totalIn = 0, totalOut = 0, totalValue = 0;
        items.forEach((item: any) => {
          totalIn += Number(item.inQty || item.inQuantity || 0);
          totalOut += Number(item.outQty || item.outQuantity || 0);
          totalValue += Number(item.endAmount || item.endValue || 0);
        });
        setStats({ totalIn, totalOut, totalValue });
      } else {
        message.error(json.message || '加载失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [current, pageSize]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 100, fixed: 'left', render: (t: string) => t || '-' },
    { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 160, fixed: 'left' },
    { title: '分类', dataIndex: 'category', key: 'category', width: 100 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
    { title: '期初数量', dataIndex: 'beginQty', key: 'beginQty', width: 90, render: (v: any) => <span style={{ fontWeight: 500 }}>{Number(v || 0)}</span> },
    { title: '期初金额', dataIndex: 'beginAmount', key: 'beginAmount', width: 100, render: (v: any) => `¥${Number(v || 0).toLocaleString()}` },
    { title: '入库数量', dataIndex: 'inQty', key: 'inQty', width: 90, render: (v: any) => <span style={{ color: '#2E7D32', fontWeight: 500 }}>+{Number(v || 0)}</span> },
    { title: '入库金额', dataIndex: 'inAmount', key: 'inAmount', width: 100, render: (v: any) => `¥${Number(v || 0).toLocaleString()}` },
    { title: '出库数量', dataIndex: 'outQty', key: 'outQty', width: 90, render: (v: any) => <span style={{ color: '#D32F2F', fontWeight: 500 }}>-{Number(v || 0)}</span> },
    { title: '出库金额', dataIndex: 'outAmount', key: 'outAmount', width: 100, render: (v: any) => `¥${Number(v || 0).toLocaleString()}` },
    { title: '期末数量', dataIndex: 'endQty', key: 'endQty', width: 90, render: (v: any) => <span style={{ fontWeight: 600 }}>{Number(v || 0)}</span> },
    { title: '期末金额', dataIndex: 'endAmount', key: 'endAmount', width: 100, render: (v: any) => <span style={{ fontWeight: 600 }}>¥{Number(v || 0).toLocaleString()}</span> },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/reports')}>返回</Button>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>收发存报表</h4>
        </Space>
        <ExportButton filename="收发存报表" onExport={async () => {}} />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card className="kpi-card">
            <Statistic title="总入库" value={stats.totalIn} prefix={<ImportOutlined style={{ color: '#2E7D32' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="kpi-card">
            <Statistic title="总出库" value={stats.totalOut} prefix={<ExportOutlined style={{ color: '#D32F2F' }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="kpi-card">
            <Statistic title="库存总值" value={stats.totalValue} prefix="¥" precision={2} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
      </Row>

      <SearchBar fields={filterFields} onSearch={(v) => console.log(v)} />

      <Card style={{ borderRadius: 8 }} styles={{ body: { padding: 0 } }}>
        <DataTable
          columns={columns}
          dataSource={data}
          loading={loading}
          current={current}
          pageSize={pageSize}
          total={total}
          onChange={(page, size) => { setCurrent(page); setPageSize(size); fetchData(page, size); }}
          scroll={{ x: 1400 }}
        />
      </Card>
    </div>
  );
}
