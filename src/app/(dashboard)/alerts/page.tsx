'use client';

export const dynamic = 'force-dynamic';

import React, { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, Col, Empty, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  AlertOutlined, FireOutlined, ReloadOutlined, ShoppingCartOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

async function readJson(res: Response) {
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function AlertsPage() {
  const { message } = App.useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({ critical: 0, warning: 0, info: 0 });
  const [filter, setFilter] = useState<string>('all');

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [creating, setCreating] = useState(false);

  const fetchAlerts = useCallback(async (type = filter) => {
    setLoading(true);
    try {
      const json = await readJson(await fetch(`/api/alerts?type=${type}&pageSize=200`, { cache: 'no-store' }));
      if (json?.success) {
        setAlerts(json.data?.items || []);
        setSummary(json.data?.summary || { critical: 0, warning: 0, info: 0 });
      } else {
        message.error(json?.error || '预警加载失败');
      }
    } catch (e: any) {
      message.error(e?.message || '预警加载失败');
    } finally {
      setLoading(false);
    }
  }, [filter, message]);

  const fetchSuggestions = useCallback(async () => {
    setSuggestLoading(true);
    try {
      const json = await readJson(await fetch('/api/replenishment', { cache: 'no-store' }));
      if (json?.success) setSuggestions(json.data || []);
      else message.error(json?.error || '补货建议计算失败');
    } catch (e: any) {
      message.error(e?.message || '补货建议计算失败');
    } finally {
      setSuggestLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  const createRequests = async () => {
    const picked = suggestions.filter((s) => selectedKeys.includes(s.productId + ':' + s.warehouseId));
    if (!picked.length) { message.warning('请先勾选要补货的商品'); return; }

    setCreating(true);
    try {
      const json = await readJson(await fetch('/api/replenishment/to-purchase-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: picked.map((p) => ({
            productId: p.productId,
            name: p.name,
            quantity: p.suggestQty,
            warehouseId: p.warehouseId || undefined,
            model: p.unit ? `单位：${p.unit}` : undefined,
            available: p.available,
            safetyStock: p.safetyStock,
          })),
        }),
      }));
      if (json?.success) {
        const { createdCount, skippedCount } = json.data || {};
        message.success(`已生成 ${createdCount ?? 0} 条购买申请${skippedCount ? `，跳过 ${skippedCount} 条已有待办` : ''}`);
        setSelectedKeys([]);
        fetchSuggestions();
      } else {
        message.error(json?.error || '生成失败');
      }
    } catch (e: any) {
      message.error(e?.message || '生成失败');
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    {
      title: '级别', dataIndex: 'level', key: 'level', width: 78,
      render: (level: string) => {
        const map: Record<string, { color: string; text: string }> = {
          CRITICAL: { color: 'red', text: '紧急' },
          WARNING: { color: 'orange', text: '警告' },
          INFO: { color: 'blue', text: '提示' },
        };
        const c = map[level] || { color: 'default', text: level };
        return <Tag bordered={false} color={c.color}>{c.text}</Tag>;
      },
    },
    { title: '类型', dataIndex: 'title', key: 'title', width: 100 },
    { title: '详情', dataIndex: 'content', key: 'content', ellipsis: true },
    { title: '商品', key: 'product', width: 200, render: (_: any, r: any) => (
      <span>{r.productName}<Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>{r.productCode}</Text></span>
    ) },
    { title: '数量', dataIndex: 'currentStock', key: 'currentStock', width: 80, align: 'right' as const },
  ];

  const suggestColumns = [
    { title: '商品', key: 'name', render: (_: any, r: any) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.name}</div>
        <Text type="secondary" style={{ fontSize: 12 }}>{r.code}</Text>
      </div>
    ) },
    { title: '仓库', dataIndex: 'warehouseName', key: 'warehouseName', width: 140 },
    { title: '可用量', dataIndex: 'available', key: 'available', width: 90, align: 'right' as const },
    { title: '安全库存', dataIndex: 'safetyStock', key: 'safetyStock', width: 100, align: 'right' as const },
    {
      title: '建议补货', dataIndex: 'suggestQty', key: 'suggestQty', width: 100, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: 'var(--primary)' }}>{v}{' '}</Text>,
    },
  ];

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">预警中心</h2>
          <p className="yc-page-desc">缺货 / 低库存 / 批次临期提醒，并可把安全库存缺口一键转成购买申请</p>
        </div>
        <Space>
          <Select
            value={filter}
            onChange={setFilter}
            style={{ width: 132 }}
            options={[
              { value: 'all', label: '全部预警' },
              { value: 'low', label: '库存不足' },
              { value: 'out', label: '缺货预警' },
              { value: 'expiry', label: '批次临期' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => { fetchAlerts(); fetchSuggestions(); }}>刷新</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card><Statistic title="紧急预警" value={summary.critical} prefix={<FireOutlined />} valueStyle={{ color: '#DC2626' }} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="警告预警" value={summary.warning} prefix={<WarningOutlined />} valueStyle={{ color: '#D97706' }} /></Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card><Statistic title="提示信息" value={summary.info} prefix={<AlertOutlined />} valueStyle={{ color: '#2563EB' }} /></Card>
        </Col>
      </Row>

      <Card title="预警列表" style={{ marginBottom: 16 }} styles={{ body: { paddingTop: 8 } }}>
        <Table
          columns={columns}
          dataSource={alerts}
          loading={loading}
          rowKey="id"
          size="middle"
          scroll={{ x: 760 }}
          pagination={{ pageSize: 15, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      <Card
        title={<Space><ThunderboltOutlined style={{ color: 'var(--primary)' }} />补货建议</Space>}
        extra={
          <Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已选 {selectedKeys.length} / {suggestions.length}
            </Text>
            <Tooltip title="按「安全库存 − 可用量」计算，已排除可用量为正的商品">
              <Button
                type="primary"
                icon={<ShoppingCartOutlined />}
                loading={creating}
                disabled={!selectedKeys.length}
                onClick={createRequests}
              >
                生成购买申请
              </Button>
            </Tooltip>
          </Space>
        }
        styles={{ body: { paddingTop: 8 } }}
      >
        <Table
          rowKey={(r: any) => r.productId + ':' + r.warehouseId}
          columns={suggestColumns}
          dataSource={suggestions}
          loading={suggestLoading}
          size="middle"
          scroll={{ x: 720 }}
          locale={{
            emptyText: (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无补货建议：所有商品可用量都在安全库存之上" />
            ),
          }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条建议` }}
        />
      </Card>
    </div>
  );
}
