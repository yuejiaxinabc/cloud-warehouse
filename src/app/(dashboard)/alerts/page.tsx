'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography, Space, Button, Select, Statistic, Row, Col, message } from 'antd';
import { AlertOutlined, WarningOutlined, InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ critical: 0, warning: 0, info: 0 });
  const [filter, setFilter] = useState<string>('all');

  const fetchAlerts = async (type = filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts?type=${type}&pageSize=100`);
      const json = await res.json();
      if (json.success) {
        setAlerts(json.data?.items || []);
        setSummary(json.data?.summary || { critical: 0, warning: 0, info: 0 });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => { fetchAlerts(); }, [filter]);

  const columns = [
    {
      title: '级别', dataIndex: 'level', key: 'level', width: 80,
      render: (level: string) => {
        const map: Record<string, { color: string; text: string }> = {
          CRITICAL: { color: 'red', text: '紧急' },
          WARNING: { color: 'orange', text: '警告' },
          INFO: { color: 'blue', text: '提示' },
        };
        const config = map[level] || { color: 'default', text: level };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    { title: '预警类型', dataIndex: 'title', key: 'title', width: 120 },
    { title: '预警详情', dataIndex: 'content', key: 'content', width: 350 },
    { title: '商品编码', dataIndex: 'productCode', key: 'productCode', width: 100 },
    { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 150 },
    { title: '当前库存', dataIndex: 'currentStock', key: 'currentStock', width: 100, render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: '安全库存', dataIndex: 'safetyStock', key: 'safetyStock', width: 100 },
    { title: '库存价值', dataIndex: 'totalValue', key: 'totalValue', width: 120, render: (v: number) => `¥${(v || 0).toLocaleString()}` },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>预警中心</h4>
        <Space>
          <Select value={filter} onChange={setFilter} style={{ width: 120 }}>
            <Option value="all">全部预警</Option>
            <Option value="low">库存不足</Option>
            <Option value="out">缺货预警</Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={() => fetchAlerts()}>刷新</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="紧急预警" value={summary.critical} valueStyle={{ color: '#D32F2F' }} prefix={<AlertOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="警告预警" value={summary.warning} valueStyle={{ color: '#ED6C02' }} prefix={<WarningOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="提示信息" value={summary.info} valueStyle={{ color: '#1976D2' }} prefix={<InfoCircleOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card>
        <Table 
          columns={columns} 
          dataSource={alerts} 
          loading={loading} 
          rowKey="id" 
          scroll={{ x: isMobile ? 800 : 1200 }}
            pagination={{ pageSize: 20 }} 
          size="small"
        />
      </Card>
    </div>
  );
}
