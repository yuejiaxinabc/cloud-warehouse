'use client';

export const dynamic = 'force-dynamic';

import React, { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, Col, DatePicker, Empty, Input, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  ClockCircleOutlined, LockOutlined, ReloadOutlined, SearchOutlined, UnlockOutlined, WarningOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

async function readJson(res: Response) {
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function InventoryLotsPage() {
  const { message, modal } = App.useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [expiring, setExpiring] = useState<string>('0');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (keyword.trim()) p.set('keyword', keyword.trim());
      if (warehouseId) p.set('warehouseId', warehouseId);
      if (expiring !== '0') p.set('expiringDays', expiring);
      p.set('page', String(page));
      p.set('pageSize', String(pageSize));
      const json = await readJson(await fetch(`/api/inventory/lots?${p}`, { cache: 'no-store' }));
      if (json?.success) {
        setRows(json.data?.items || []);
        setTotal(json.data?.total || 0);
      } else message.error(json?.error || '批次加载失败');
    } catch (e: any) {
      message.error(e?.message || '批次加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, warehouseId, expiring, page, pageSize, message]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/warehouse', { cache: 'no-store' })
      .then(readJson)
      .then((d) => { if (d?.success) setWarehouses(d.data || []); })
      .catch(() => {});
  }, []);

  const toggleFreeze = (record: any) => {
    const freezing = !record.frozen;
    modal.confirm({
      title: freezing ? '冻结该批次？' : '解冻该批次？',
      content: freezing
        ? `批次 ${record.lotNumber} 数量 ${Number(record.quantity)} 将计入锁定量，出库时不可用。`
        : `批次 ${record.lotNumber} 将释放锁定量，恢复可用。`,
      okText: freezing ? '冻结' : '解冻',
      cancelText: '取消',
      onOk: async () => {
        try {
          const json = await readJson(await fetch(`/api/inventory/lots/${record.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: freezing ? 'freeze' : 'unfreeze' }),
          }));
          if (json?.success) {
            message.success(freezing ? '已冻结' : '已解冻');
            load();
          } else message.error(json?.error || '操作失败');
        } catch (e: any) {
          message.error(e?.message || '操作失败');
        }
      },
    });
  };

  const stats = {
    soon: rows.filter((r) => r.expiryState === 'soon').length,
    expired: rows.filter((r) => r.expiryState === 'expired').length,
    frozen: rows.filter((r) => r.frozen).length,
  };

  const columns = [
    { title: '批次号', dataIndex: 'lotNumber', key: 'lotNumber', width: 140, render: (v: string) => (
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, whiteSpace: 'nowrap' }}>{v}</span>
    ) },
    {
      title: '商品', key: 'product', width: 176,
      render: (_: any, r: any) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.product?.name}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.product?.code}</Text>
        </div>
      ),
    },
    { title: '仓库', key: 'warehouse', width: 96, render: (_: any, r: any) => <span style={{ whiteSpace: 'nowrap' }}>{r.warehouse?.name || '-'}</span> },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 62, align: 'right' as const,
      render: (v: any, r: any) => <Text strong>{Number(v)} {r.product?.unit?.name || ''}</Text> },
    { title: '生产日期', dataIndex: 'producedAt', key: 'producedAt', width: 94,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{new Date(v).toLocaleDateString('zh-CN')}</span> : <Text type="secondary">—</Text>) },
    { title: '到期日期', dataIndex: 'expiredAt', key: 'expiredAt', width: 94,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{new Date(v).toLocaleDateString('zh-CN')}</span> : <Text type="secondary">—</Text>) },
    {
      title: '剩余天数', dataIndex: 'daysLeft', key: 'daysLeft', width: 96, align: 'right' as const,
      render: (v: number | null) => {
        if (v === null || v === undefined) return <Text type="secondary">—</Text>;
        const color = v < 0 ? 'red' : v <= 7 ? 'red' : v <= 30 ? 'orange' : 'green';
        return <Tag bordered={false} color={color}>{v < 0 ? `已过期 ${Math.abs(v)} 天` : `${v} 天`}</Tag>;
      },
    },
    {
      title: '状态', key: 'status', width: 78,
      render: (_: any, r: any) => (r.frozen
        ? <Tag bordered={false} color="purple">已冻结</Tag>
        : r.expiryState === 'expired'
          ? <Tag bordered={false} color="red">已过期</Tag>
          : <Tag bordered={false} color="success">可用</Tag>),
    },
    {
      title: '', key: 'action', width: 76, align: 'right' as const,
      render: (_: any, r: any) => (
        <Tooltip title={r.frozen ? '解冻后恢复可用' : '冻结后从可用量扣除'}>
          <Button
            size="small"
            type={r.frozen ? 'default' : 'text'}
            danger={!r.frozen}
            icon={r.frozen ? <UnlockOutlined /> : <LockOutlined />}
            onClick={() => toggleFreeze(r)}
          >
            {r.frozen ? '解冻' : '冻结'}
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">批次与效期</h2>
          <p className="yc-page-desc">按批次追踪生产日期 / 到期日期，支持临期筛选与库存冻结</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}><Card><Statistic title="本页临期（≤30 天）" value={stats.soon} prefix={<WarningOutlined />} valueStyle={{ color: '#D97706' }} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="本页已过期" value={stats.expired} prefix={<ClockCircleOutlined />} valueStyle={{ color: '#DC2626' }} /></Card></Col>
        <Col xs={24} sm={8}><Card><Statistic title="本页冻结批次" value={stats.frozen} prefix={<LockOutlined />} valueStyle={{ color: '#7C3AED' }} /></Card></Col>
      </Row>

      <Card styles={{ body: { paddingTop: 12 } }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="批次号 / 商品编码 / 名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => { setPage(1); load(); }}
            style={{ width: 260 }}
          />
          <Select
            allowClear
            placeholder="全部仓库"
            value={warehouseId}
            onChange={(v) => { setWarehouseId(v); setPage(1); }}
            style={{ width: 160 }}
            options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
          />
          <Select
            value={expiring}
            onChange={(v) => { setExpiring(v); setPage(1); }}
            style={{ width: 150 }}
            options={[
              { value: '0', label: '全部批次' },
              { value: '7', label: '7 天内到期' },
              { value: '30', label: '30 天内到期' },
              { value: '90', label: '90 天内到期' },
            ]}
          />
          <Button type="primary" ghost icon={<SearchOutlined />} onClick={() => { setPage(1); load(); }}>查询</Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="middle"
          scroll={{ x: 912 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有批次记录，入库并录入批次号后出现在这里" /> }}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true, pageSizeOptions: [20, 50, 100],
            showTotal: (t) => `共 ${t} 个批次`,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
          }}
        />
      </Card>
    </div>
  );
}
