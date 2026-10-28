'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Empty, Popconfirm, Space, Table, Tabs, Tag, Typography } from 'antd';
import { DeleteOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';

const { Text } = Typography;

async function readJson(res: Response) {
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

const ENTITIES = [
  { key: 'product', label: '商品' },
  { key: 'supplier', label: '供应商' },
  { key: 'customer', label: '客户' },
  { key: 'warehouse', label: '仓库' },
  { key: 'category', label: '分类' },
  { key: 'unit', label: '单位' },
];

export default function TrashPage() {
  const { message } = App.useApp();
  const [entity, setEntity] = useState('product');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (e = entity) => {
    setLoading(true);
    try {
      const json = await readJson(await fetch(`/api/trash?entity=${e}`, { cache: 'no-store' }));
      if (json?.success) setRows(json.data || []);
      else message.error(json?.error || '回收站加载失败');
    } catch (err: any) {
      message.error(err?.message || '回收站加载失败');
    } finally {
      setLoading(false);
    }
  }, [entity, message]);

  useEffect(() => { load(entity); }, [entity, load]);

  const restore = async (row: any) => {
    const json = await readJson(await fetch('/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, id: row.id }),
    }));
    if (json?.success) { message.success('已恢复'); load(); }
    else message.error(json?.error || '恢复失败');
  };

  const purge = async (row: any) => {
    const json = await readJson(await fetch(`/api/trash?entity=${entity}&id=${row.id}`, { method: 'DELETE' }));
    if (json?.success) { message.success('已彻底删除'); load(); }
    else message.error(json?.error || '删除失败');
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (v: string, r: any) => (
      <div>
        <div style={{ fontWeight: 600 }}>{v}</div>
        {r.code && <Text type="secondary" style={{ fontSize: 12 }}>{r.code}</Text>}
      </div>
    ) },
    { title: '删除时间', dataIndex: 'deletedAt', key: 'deletedAt', width: 180, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '—' },
    {
      title: '保留期', dataIndex: 'daysLeft', key: 'daysLeft', width: 110,
      render: (v: number) => <Tag bordered={false} color={v <= 3 ? 'red' : v <= 7 ? 'orange' : 'default'}>剩 {v} 天</Tag>,
    },
    {
      title: '', key: 'action', width: 180, align: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<UndoOutlined />} onClick={() => restore(r)}>恢复</Button>
          <Popconfirm title="彻底删除后不可恢复，确定？" okText="删除" cancelText="取消" onConfirm={() => purge(r)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>彻底删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">回收站</h2>
          <p className="yc-page-desc">被删除的主数据在这里保留 15 天，可随时恢复；彻底删除仅管理员可操作</p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
      </div>

      <Card styles={{ body: { paddingTop: 4 } }}>
        <Tabs
          activeKey={entity}
          onChange={setEntity}
          items={ENTITIES.map((e) => ({
            key: e.key,
            label: e.label,
            children: (
              <Table
                rowKey="id"
                size="middle"
                columns={columns}
                dataSource={rows}
                loading={loading}
                scroll={{ x: 640 }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="回收站是空的" /> }}
                pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
              />
            ),
          }))}
        />
      </Card>
    </div>
  );
}
