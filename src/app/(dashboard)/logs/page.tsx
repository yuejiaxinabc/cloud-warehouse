'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Card, Table, Input, Space, Tag, DatePicker, Button, Tabs, Select, Modal, message } from 'antd';
import { SearchOutlined, DownloadOutlined, FileTextOutlined, SettingOutlined, DatabaseOutlined, LoginOutlined } from '@ant-design/icons';
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
  // 密码重置（/api/auth/admin-reset）：英文操作名直接入库，这里补中文映射
  password_reset_by_token: '凭令牌重置密码',
  reset_token_set: '设置重置令牌',
  reset_token_clear: '撤销重置令牌',
  password_reset: '重置密码',
  password_change: '修改密码',
  admin_reset: '管理员重置密码',
  '2fa_enable': '开启两步验证',
  '2fa_disable': '关闭两步验证',
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

// ==================== 登录日志（v1.2.3） ====================
// 数据来自 /api/login-logs（login_logs 表），与上面三个 tab 的 operation_logs 不是同一张表。

interface LoginLogItem {
  id: string;
  userId: string | null;
  username: string;
  action: string;
  success: boolean;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** 动作中文映射与颜色 */
const LOGIN_ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: '登录', color: 'green' },
  logout: { label: '登出', color: 'blue' },
  failed: { label: '登录失败', color: 'red' },
  locked: { label: '账号锁定', color: 'orange' },
  '2fa_failed': { label: '两步验证失败', color: 'volcano' },
};

function LoginLogsTab() {
  const [items, setItems] = useState<LoginLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [username, setUsername] = useState('');
  const [action, setAction] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [stats, setStats] = useState({ todayTotal: 0, todayFailed: 0, uniqueUsers: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (username) params.set('username', username);
      if (action) params.set('action', action);
      if (success) params.set('success', success);
      if (dateRange[0]) params.set('dateFrom', dateRange[0].format('YYYY-MM-DD'));
      if (dateRange[1]) params.set('dateTo', dateRange[1].format('YYYY-MM-DD'));

      const res = await fetch(`/api/login-logs?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data?.items || []);
        setTotal(data.data?.total || 0);
        if (data.data?.stats) setStats(data.data.stats);
      } else {
        message.error(data.error || '登录日志加载失败');
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [page, username, action, success, dateRange]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '账号', dataIndex: 'username', width: 130, render: (v: string) => v || '-' },
    { title: '动作', dataIndex: 'action', width: 120, render: (v: string) => {
      const a = LOGIN_ACTION_LABELS[v];
      return <Tag color={a?.color || 'default'}>{a?.label || v}</Tag>;
    }},
    { title: '结果', dataIndex: 'success', width: 80, render: (v: boolean) => (
      <Tag color={v ? 'green' : 'red'}>{v ? '成功' : '失败'}</Tag>
    )},
    { title: '原因', dataIndex: 'reason', ellipsis: true, render: (v: string | null) => v || '-' },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (v: string | null) => v || '-' },
    { title: '客户端', dataIndex: 'userAgent', ellipsis: true, render: (v: string | null) => v || '-' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, color: '#666' }}>
        今日登录事件 <b>{stats.todayTotal}</b> 条，失败 <b style={{ color: '#cf1322' }}>{stats.todayFailed}</b> 条，涉及账号 <b>{stats.uniqueUsers}</b> 个
      </div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="账号（模糊匹配）"
          value={username}
          onChange={e => { setUsername(e.target.value); setPage(1); }}
          style={{ width: 200 }}
          allowClear
        />
        <Select
          placeholder="动作"
          value={action}
          onChange={v => { setAction(v); setPage(1); }}
          style={{ width: 150 }}
          allowClear
          options={Object.entries(LOGIN_ACTION_LABELS).map(([value, m]) => ({ value, label: m.label }))}
        />
        <Select
          placeholder="结果"
          value={success}
          onChange={v => { setSuccess(v); setPage(1); }}
          style={{ width: 120 }}
          allowClear
          options={[{ value: 'true', label: '成功' }, { value: 'false', label: '失败' }]}
        />
        <RangePicker
          onChange={(dates) => { setDateRange(dates || [null, null]); setPage(1); }}
          placeholder={['开始日期', '结束日期']}
        />
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
  const [activeKey, setActiveKey] = useState('system');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');
  const [clearing, setClearing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const doClear = async () => {
    if (clearText.trim() !== '清空日志') { message.warning('请按提示输入「清空日志」'); return; }
    setClearing(true);
    try {
      const res = await fetch('/api/logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ scope: activeKey, confirm: '清空日志' }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) throw new Error('登录已过期，请重新登录');
      if (res.status === 403) throw new Error('权限不足，仅管理员可清空日志');
      if (!res.ok || !json?.success) throw new Error(json?.error || '清空失败');
      message.success(json.message || '已清空');
      setClearOpen(false);
      setClearText('');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e.message || '清空失败');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div style={{ padding: 0 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Button danger onClick={() => { setClearText(''); setClearOpen(true); }}>清空当前日志</Button>
        </div>
        <Tabs
          defaultActiveKey="system"
          activeKey={activeKey}
          onChange={setActiveKey}
          items={[
            { key: 'system', label: <span><SettingOutlined /> 系统日志</span>, children: <LogsTab key={'system-' + reloadKey} type="system" /> },
            { key: 'operation', label: <span><FileTextOutlined /> 操作日志</span>, children: <LogsTab key={'operation-' + reloadKey} type="operation" /> },
            { key: 'inventory', label: <span><DatabaseOutlined /> 库存日志</span>, children: <LogsTab key={'inventory-' + reloadKey} type="inventory" /> },
            { key: 'login', label: <span><LoginOutlined /> 登录日志</span>, children: <LoginLogsTab key={'login-' + reloadKey} /> },
          ]}
        />
      </Card>

      <Modal
        title="清空日志"
        open={clearOpen}
        onCancel={() => { if (!clearing) setClearOpen(false); }}
        onOk={doClear}
        okText="确认清空"
        okButtonProps={{ danger: true, loading: clearing, disabled: clearText.trim() !== '清空日志' }}
        cancelText="取消"
        destroyOnClose
      >
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message="清空后无法恢复，请确认已完成备份"
          description={
            <div>
              <div>将删除当前页签
                <b>{activeKey === 'system' ? '（系统日志）' : activeKey === 'operation' ? '（操作日志）' : activeKey === 'inventory' ? '（库存日志）' : '（登录日志）'}</b>
                下的全部记录，其它页签不受影响。</div>
              <div style={{ marginTop: 6 }}>清空动作本身会写一条系统日志：操作人、时间、清空条数与范围。</div>
            </div>
          }
        />
        <p>请输入 <b>清空日志</b> 以确认：</p>
        <Input
          value={clearText}
          onChange={(e) => setClearText(e.target.value)}
          placeholder="清空日志"
          disabled={clearing}
        />
      </Modal>
    </div>
  );
}
