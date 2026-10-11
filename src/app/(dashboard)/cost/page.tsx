'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Typography, Space, Select, Button, Row, Col, Statistic, Tabs, message, Modal, DatePicker } from 'antd';
import { DollarOutlined, SwapOutlined, CalculatorOutlined, CameraOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const methodLabels: Record<string, string> = { WEIGHTED: "移动加权", FIFO: "先进先出", MONTHLY: "月度加权" };

export default function CostPage() {
  const [costData, setCostData] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [fifoValue, setFifoValue] = useState(0);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<dayjs.Dayjs | null>(dayjs());
  const [generating, setGenerating] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports?type=cost');
      const json = await res.json();
      if (json.code === 0) {
        const items = json.data?.items || json.data?.list || json.data || [];
        setCostData(items);
        
        let tv = 0, fv = 0;
        items.forEach((item: any) => {
          tv += Number(item.totalValue || 0);
          fv += Number(item.fifoValue != null ? item.fifoValue : (item.fifoCost != null ? item.fifoCost * item.stock : 0));
        });
        setTotalValue(tv);
        setFifoValue(fv);
      }

      const snapRes = await fetch('/api/reports?type=cost-snapshots');
      const snapJson = await snapRes.json();
      if (snapJson.code === 0) {
        setSnapshots(snapJson.data?.items || snapJson.data?.list || snapJson.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setIsMobile(window.innerWidth < 768); const h = () => setIsMobile(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);

  useEffect(() => { fetchData(); }, []);

  const handleGenerateSnapshot = async () => {
    if (!selectedMonth) {
      message.warning('请选择月份');
      return;
    }
    
    setGenerating(true);
    try {
      const period = selectedMonth.format('YYYY-MM');
      const res = await fetch('/api/cost-snapshots/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const json = await res.json();
      if (json.success || json.code === 0) {
        message.success(json.message || `成本快照生成成功`);
        setGenerateModalOpen(false);
        fetchData(); // Refresh data
      } else {
        message.error(json.error || json.message || '生成失败');
      }
    } catch (e) {
      message.error('生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const chartData = costData.map(d => ({
    name: d.productName || d.product || '-',
    移动加权: Number(d.avgCost || d.weightedCost || 0),
    FIFO: Number(d.fifoCost || 0),
    月度加权: Number(d.monthlyCost || 0),
  }));

  const columns = [
    { title: "SKU", dataIndex: "sku", key: "sku", width: 100, render: (_: any, r: any) => r.product?.code || r.sku || '-' },
    { title: "商品", key: "product", width: 160, render: (_: any, r: any) => r.product?.name || r.productName || '-' },
    { title: "成本方法", dataIndex: "method", width: 100, render: (m: string) => <Tag color="blue">{methodLabels[m] || m || '移动加权'}</Tag> },
    { title: "移动加权", dataIndex: "avgCost", width: 120, render: (v: any, r: any) => `¥${Number(v || r.weightedCost || 0).toFixed(2)}` },
    { title: "FIFO成本", dataIndex: "fifoCost", width: 120, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: "月度加权", dataIndex: "monthlyCost", width: 120, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: "库存量", dataIndex: "stock", key: "stock", width: 100, render: (v: any, r: any) => Number(v || r.quantity || 0).toLocaleString() },
    { title: "库存价值", dataIndex: "totalValue", width: 120, render: (v: any) => <Text strong style={{ color: "#52c41a" }}>¥{Number(v || 0).toLocaleString()}</Text> },
  ];

  const snapshotColumns = [
    { title: "月份", dataIndex: "period", key: "period", width: 100, render: (t: string) => <Tag color="blue">{t}</Tag> },
    { title: "商品数", dataIndex: "productCount", key: "productCount", width: 80 },
    { title: "总价值", dataIndex: "totalValue", key: "totalValue", width: 120, render: (v: any) => `¥${Number(v || 0).toLocaleString()}` },
    { title: "方法", dataIndex: "method", key: "method", width: 80 },
    { title: "生成时间", dataIndex: "createdAt", key: "createdAt", width: 160, render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>成本核算</h4>
        <Button type="primary" icon={<CameraOutlined />} onClick={() => setGenerateModalOpen(true)}>
          生成月末快照
        </Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}><Card className="kpi-card"><Statistic title="库存总价值" value={totalValue} prefix="¥" precision={2} valueStyle={{ color: "#52c41a" }} /></Card></Col>
        <Col xs={24} sm={8}><Card className="kpi-card"><Statistic title="FIFO总价值" value={fifoValue} prefix="¥" precision={2} valueStyle={{ color: "#1677ff" }} /></Card></Col>
        <Col xs={24} sm={8}><Card className="kpi-card"><Statistic title="成本差异" value={totalValue - fifoValue} prefix="¥" precision={2} valueStyle={{ color: "#faad14" }} /></Card></Col>
      </Row>

      <Tabs items={[
        { key: "compare", label: "成本对比", children: (
          <>
            <Card title="成本对比表">
              <Table columns={columns} dataSource={costData} loading={loading} rowKey="id" scroll={{ x: isMobile ? 800 : 1200 }} pagination={false} size="small" />
            </Card>
            {chartData.length > 0 && (
              <Card title="成本方法对比" style={{ marginTop: 16 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="移动加权" fill="#1890ff" />
                    <Bar dataKey="FIFO" fill="#52c41a" />
                    <Bar dataKey="月度加权" fill="#faad14" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )}
          </>
        )},
        { key: "snapshots", label: "月末快照", children: (
          <Card title="历史快照记录" extra={<Button onClick={fetchData} loading={loading}>刷新</Button>}>
            <Table columns={snapshotColumns} dataSource={snapshots} loading={loading} rowKey="period" pagination={{ pageSize: 12 }} size="small" />
          </Card>
        )},
      ]} />

      {/* Generate Snapshot Modal */}
      <Modal
        title="生成月末成本快照"
        open={generateModalOpen}
        onCancel={() => setGenerateModalOpen(false)}
        onOk={handleGenerateSnapshot}
        okText="生成"
        cancelText="取消"
        confirmLoading={generating}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>选择要生成快照的月份：</Text>
        </div>
        <DatePicker
          picker="month"
          value={selectedMonth}
          onChange={(date) => setSelectedMonth(date)}
          style={{ width: '100%' }}
          placeholder="选择月份"
        />
        <div style={{ marginTop: 16, color: '#666', fontSize: 12 }}>
          <Text type="secondary">
            快照将记录该月末（23:59:59）的库存状态，包括期初、入库、出库、期末数量和金额。
          </Text>
        </div>
      </Modal>
    </div>
  );
}
