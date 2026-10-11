'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Input, Space, Tag, DatePicker, Button, Tabs, message } from 'antd';
import { SearchOutlined, DownloadOutlined, FileTextOutlined, SettingOutlined, DatabaseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface LogItem {
  id: string;
  userId: string | null;
  module: string;
  action: string;
  refType: string | null;
  refId: string | null;
  content: string | null;
  ip: string | null;
  createdAt: string;
  user?: { id: string; username: string; realName: string } | null;
}

const MODULE_LABELS: Record<string, { label: string; color: string }> = {
  system:    { label: '系统', color: 'blue' },
  auth:      { label: '登录', color: 'cyan' },
  user:      { label: '用户', color: 'purple' },
  role:      { label: '角色', color: 'magenta' },
  settings:  { label: '设置', color: 'geekblue' },
  product:   { label: '商品', color: 'green' },
  warehouse: { label: '仓库', color: 'lime' },
  category:  { label: '分类', color: 'orange' },
  unit:      { label: '单位', color: 'gold' },
  supplier:  { label: '供应商', color: 'volcano' },
  'stock-in':   { label: '入库', color: '#87d068' },
  'stock-out':  { label: '出库', color: '#f50' },
  transfer:     { label: '调拨', color: '#2db7f5' },
  stocktake:    { label: '盘点', color: '#87d068' },
  inventory:    { label: '库存', color: '#108ee9' },
};

const ACTION_LABELS: Record<string, string> = {
  create: '新建', update: '编辑', delete: '删除',
  login: '登录', logout: '登出', approve: '审核',
  import: '导入', export: '导出', adjust: '调整',
  post: '过账', cancel: '取消', receive: '收货',
};

function LogsTab({ type }: { type: string }) {
  const [items, setItems] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, page: String(page), pageSize: '20' });
      if (keyword) params.set('keyword', keyword);
      if (dateRange[0]) params.set('dateFrom', dateRange[0].format('YYYY-MM-DD'));
      if (dateRange[1]) params.set('dateTo', dateRange[1].format('YYYY-MM-DD'));

      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data?.items || []);
        setTotal(data.data?.total || 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [type, page, keyword, dateRange]);

  useEffect(() => { load(); }, [load]);

  // 导出 CSV
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ type, page: '1', pageSize: '9999' });
      if (keyword) params.set('keyword', keyword);
      if (dateRange[0]) params.set('dateFrom', dateRange[0].format('YYYY-MM-DD'));
      if (dateRange[1]) params.set('dateTo', dateRange[1].format('YYYY-MM-DD'));

      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      const allItems: LogItem[] = data.data?.items || [];

      const header = ['ID', '时间', '操作人', '模块', '操作', '内容', 'IP'];
      const rows = allItems.map((r: LogItem) => [
        r.id,
        dayjs(r.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        r.user?.realName || r.user?.username || '-',
        MODULE_LABELS[r.module]?.label || r.module,
        ACTION_LABELS[r.action] || r.action,
        (r.content || '-').replace(/[\r\n]/g, ' '),
        r.ip || '-',
      ]);

      const csv = [header, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const names: Record<string, string> = { system: '系统日志', operation: '操作日志', inventory: '库存日志' };
      a.download = `${names[type] || '日志'}_${dayjs().format('YYYYMMDD')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (e: any) {
      message.error('导出失败: ' + e.message);
    }
  };

  const columns = [
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '操作人', key: 'user', width: 100, render: (_: any, r: LogItem) => r.user?.realName || r.user?.username || '-' },
    { title: '模块', dataIndex: 'module', width: 80, render: (v: string) => {
      const m = MODULE_LABELS[v];
      return <Tag color={m?.color || 'default'}>{m?.label || v}</Tag>;
    }},
    { title: '操作', dataIndex: 'action', width: 80, render: (v: string) => ACTION_LABELS[v] || v },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string) => v || '-' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索内容/操作"
          value={keyword}
          onChange={e => { setKeyword(e.target.value); setPage(1); }}
          style={{ width: 220 }}
          allowClear
        />
        <RangePicker
          onChange={(dates) => { setDateRange(dates || [null, null]); setPage(1); }}
          placeholder={['开始日期', '结束日期']}
        />
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出CSV</Button>
      </div>
      <Table
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: page, total, pageSize: 20, showTotal: t => `共 ${t} 条`,
          onChange: p => setPage(p),
        }}
      />
    </div>
  );
}

export default function LogsPage() {
  return (
    <div style={{ padding: 0 }}>
      <Card>
        <Tabs
          defaultActiveKey="system"
          items={[
            { key: 'system', label: <span><SettingOutlined /> 系统日志</span>, children: <LogsTab type="system" /> },
            { key: 'operation', label: <span><FileTextOutlined /> 操作日志</span>, children: <LogsTab type="operation" /> },
            { key: 'inventory', label: <span><DatabaseOutlined /> 库存日志</span>, children: <LogsTab type="inventory" /> },
          ]}
        />
      </Card>
    </div>
  );
}
