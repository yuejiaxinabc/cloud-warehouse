'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Typography, Button, Space, message } from 'antd';
import { ArrowLeftOutlined, WarningOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable';
import { ExportButton } from '@/components/ui/ExportButton';

const { Title, Text } = Typography;

export default function ReportAgingPage() {
  const router = useRouter();
  const [agingDistribution, setAgingDistribution] = useState<any[]>([]);
  const [staleData, setStaleData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formula, setFormula] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports?type=aging');
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setAgingDistribution(json.data?.distribution || []);
        setStaleData(json.data?.staleItems || []);
        setFormula(json.data?.formula || '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const defaultDistribution = [
    { range: '0-30天', count: 0, percentage: 0, color: '#2E7D32' },
    { range: '31-60天', count: 0, percentage: 0, color: '#1976D2' },
    { range: '61-90天', count: 0, percentage: 0, color: '#ED6C02' },
    { range: '90天以上', count: 0, percentage: 0, color: '#D32F2F' },
  ];

  const distribution = agingDistribution.length > 0 ? agingDistribution : defaultDistribution;

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 100, render: (t: string) => <span style={{ fontFamily: 'monospace' }}>{t || '-'}</span> },
    { title: '商品名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '仓库', dataIndex: 'warehouse', key: 'warehouse', width: 100 },
    { title: '库存量', dataIndex: 'qty', key: 'qty', width: 80, render: (v: any) => <span style={{ fontWeight: 600 }}>{Number(v || 0)}</span> },
    {
      title: '库龄(天)', dataIndex: 'agingDays', key: 'agingDays', width: 100,
      render: (v: number) => {
        const color = v > 90 ? '#D32F2F' : v > 60 ? '#ED6C02' : v > 30 ? '#1976D2' : '#2E7D32';
        return <Tag color={color}>{v || 0}天</Tag>;
      },
    },
    { title: '库存金额', dataIndex: 'value', key: 'value', width: 100, render: (v: any) => `¥${Number(v || 0).toLocaleString()}` },
    {
      title: '处理建议', dataIndex: 'suggestion', key: 'suggestion', width: 100,
      render: (t: string) => {
        const color = t === '促销清仓' ? 'red' : t === '关注处理' ? 'orange' : 'green';
        return <Tag color={color}>{t || '正常'}</Tag>;
      },
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/reports')}>返回</Button>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>库龄分析</h4>
        </Space>
        <ExportButton filename="库龄分析" onExport={async () => {}} />
      </div>

      {/* 计算公式 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ background: '#E3F2FD', padding: '8px 16px', borderRadius: 8 }}>
            <Text strong>计算公式：</Text>
          </div>
          <Text code style={{ fontSize: 14 }}>
            {formula || '库龄 = 当前日期 - 最早入库日期'}
          </Text>
        </div>
      </Card>

      {/* 库龄分布 */}
      <Card title="库龄分布" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[24, 16]}>
          {distribution.map((item) => (
            <Col xs={12} sm={6} key={item.range}>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: `conic-gradient(${item.color} ${item.percentage * 3.6}deg, #F3F4F6 ${item.percentage * 3.6}deg)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 8px',
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      background: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.percentage}%</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.range}</div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{item.count} 件</div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 呆滞库存列表 */}
      <Card 
        title={
          <Space>
            <WarningOutlined style={{ color: '#D32F2F' }} />
            <span>呆滞库存列表</span>
            <Tag color="red">{staleData.length} 项</Tag>
          </Space>
        } 
        style={{ borderRadius: 8 }} 
        styles={{ body: { padding: 0 } }}
      >
        <DataTable 
          columns={columns} 
          dataSource={staleData} 
          loading={loading} 
          current={1} 
          pageSize={20} 
          total={staleData.length} 
        />
      </Card>
    </div>
  );
}
