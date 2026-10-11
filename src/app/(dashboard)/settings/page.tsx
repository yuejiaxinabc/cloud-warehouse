'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Tabs, Card, Form, Input, Button, Table, Space, Tag, Modal, Select, Tooltip,
  message, Switch, Descriptions, Divider, Popconfirm, Alert, Spin, InputNumber, Typography
} from 'antd';
const { Title, Text } = Typography;
import {
  UserOutlined, LockOutlined, MailOutlined, TeamOutlined,
  SettingOutlined, FileTextOutlined, EyeOutlined,
  EditOutlined, DeleteOutlined, KeyOutlined, PlusOutlined, SendOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { TabPane } = Tabs;

// ========== Types ==========
interface UserInfo {
  id: number; username: string; realName: string; phone: string;
  email: string; status: number; emailVerified: boolean;
  roles: string[];
}
interface RoleInfo {
  id: number; name: string; code: string; remark: string;
  status: number; userCount: number;
  rolePermissions: { permission: { id: number; name: string; code: string } }[];
}
interface SmtpConfig {
  host: string; port: number; user: string; pass: string;
  from: string; secure: boolean;
}
interface SystemConfig {
  companyName: string; contactPhone: string; contactEmail: string;
  lowStockAlertDays: number; autoBackupEnabled: boolean;
  backupSchedule: string; backupRetentionDays: number;
}
interface UploadConfig {
  id: number; category: string; provider: string;
  bucket: string; region: string; accessKey: string;
  secretKey: string; endpoint: string; cdnDomain: string;
  isActive: boolean; localPath: string;
}
interface LogEntry {
  id: number; operatorId: number; action: string; entityType: string;
  entityId: number; oldData: string; newData: string;
  ipAddress: string; userAgent: string; createdAt: string;
  user: { realName: string; username: string };
}

// ========== Helper: fetch with auth ==========
async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, credentials: 'include' });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error(text || "服务器无响应"); }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ========== Tab: 个人资料 ==========
const ProfileTab: React.FC = () => {
  const [form] = Form.useForm();
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    setLoading(true);
    apiFetch('/api/settings/profile')
      .then(d => { if (d.success) { form.setFieldsValue(d.data); } })
      .catch(() => message.error('加载个人资料失败'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const d = await apiFetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (d.success) message.success('保存成功');
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  

  return (
    <Card loading={loading}>
      <Form form={form} layout="vertical">
        <Form.Item label="用户名" name="username"><Input disabled /></Form.Item>
        <Form.Item label="姓名" name="realName" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item label="手机号" name="phone"><Input /></Form.Item>
        <Form.Item label="邮箱" name="email"><Input /></Form.Item>
        <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
      </Form>
    </Card>
  );
};

// ========== Tab: 修改密码 ==========
const PasswordTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleChangePwd = async () => {
    try {
      const values = await form.validateFields();
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次密码不一致'); return;
      }
      setLoading(true);
      const d = await apiFetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
      });
      if (d.success) { message.success('密码已修改'); form.resetFields(); }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Card>
      <Form form={form} layout="vertical" style={{ maxWidth: 400 }}>
        <Form.Item label="当前密码" name="oldPassword" rules={[{ required: true }]}><Input.Password /></Form.Item>
        <Form.Item label="新密码" name="newPassword" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>
        <Form.Item label="确认新密码" name="confirmPassword" rules={[{ required: true }]}><Input.Password /></Form.Item>
        <Button type="primary" onClick={handleChangePwd} loading={loading}>修改密码</Button>
      </Form>
    </Card>
  );
};

// ========== Tab: 用户管理（管理员） ==========
const UsersTab: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserInfo | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ud, rd] = await Promise.all([
        apiFetch('/api/users'),
        apiFetch('/api/roles'),
      ]);
      if (ud.success) setUsers(ud.data?.list || ud.data || []);
      if (rd.success) setRoles(rd.data?.items || rd.data?.list || rd.data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `/api/users?id=${editing.id}` : '/api/users';
      const body = values;
      const d = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (d.success) { message.success(editing ? '用户已更新' : '用户已创建'); setModalOpen(false); form.resetFields(); setEditing(null); load(); }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      const d = await apiFetch(`/api/users?id=${id}`, { method: 'DELETE' });
      if (d.success) { message.success('已删除'); load(); }
    } catch (e: any) { message.error(e.message); }
  };

  
  // 全局重置令牌
  const [tokenModal, setTokenModal] = useState<{ open: boolean; token: string }>({ open: false, token: "" });

  const handleSetGlobalToken = async (customToken?: string) => {
    try {
      const body: any = { action: "set-token" };
      if (customToken && customToken.trim()) {
        if (customToken.trim().length < 16) { message.warning("令牌不能少于16位"); return; }
        body.token = customToken.trim();
      }
      const d = await apiFetch("/api/auth/admin-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (d.success) {
        setTokenModal({ open: true, token: d.data.token });
        message.success("全局重置令牌已设置");
      } else {
        message.error(d.error || "设置失败");
      }
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username' },
    { title: '姓名', dataIndex: 'realName' },
    ...(!isMobile ? [
      { title: '手机号', dataIndex: 'phone', width: 120 },
      { title: '邮箱', dataIndex: 'email', width: 160 },
    ] : []),
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作', width: 100, fixed: 'right' as const,
      render: (_: any, record: UserInfo) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          新建用户
        </Button>
        <Button icon={<KeyOutlined />} onClick={() => {
          Modal.confirm({
            title: "设置全局重置令牌",
            content: (
              <div>
                <p style={{ marginBottom: 8 }}>输入自定义令牌（至少16位），或留空自动生成：</p>
                <Input id="globalTokenInput" placeholder="留空则自动生成32位令牌" />
              </div>
            ),
            onOk: () => {
              const input = document.getElementById("globalTokenInput") as HTMLInputElement;
              handleSetGlobalToken(input?.value || "");
            },
          });
        }}>
          设置重置令牌
        </Button>
      </div>
      <Table columns={columns} dataSource={users} loading={loading} rowKey="id" size="small" scroll={{ x: isMobile ? 800 : undefined }}
            pagination={{ pageSize: 20 }} />
      <Modal title={editing ? '编辑用户' : '新建用户'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          {!editing && <Form.Item label="密码" name="password" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>}
          <Form.Item label="姓名" name="realName" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="手机号" name="phone"><Input /></Form.Item>
          <Form.Item label="邮箱" name="email"><Input /></Form.Item>
          <Form.Item label="状态" name="status" initialValue={1}>
            <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
          </Form.Item>
        </Form>
      </Modal>
      {/* 全局令牌弹窗 */}
      <Modal
        title="全局重置令牌"
        open={tokenModal.open}
        onCancel={() => setTokenModal({ open: false, token: "" })}
        footer={
          <Space>
            <Button onClick={() => { navigator.clipboard.writeText(tokenModal.token); message.success("已复制"); }}>复制令牌</Button>
            <Button type="primary" onClick={() => setTokenModal({ open: false, token: "" })}>关闭</Button>
          </Space>
        }
      >
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <p style={{ fontSize: 14, color: "#64748B", marginBottom: 16 }}>
            系统全局重置令牌（所有用户共用）：
          </p>
          <div style={{
            fontSize: 16, fontFamily: "monospace", fontWeight: 700,
            color: "#2563EB", letterSpacing: "0.08em",
            padding: "14px 20px", background: "#EFF6FF",
            borderRadius: 10, border: "1px solid #BFDBFE",
            wordBreak: "break-all", userSelect: "all",
          }}>
            {tokenModal.token}
          </div>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 12 }}>
            此令牌长期有效，直到管理员重新设置或清除
          </p>
          <p style={{ fontSize: 13, color: "#DC2626", marginTop: 4 }}>
            请妥善保管，告知需要重置密码的用户
          </p>
        </div>
      </Modal>
    </Card>
  );
};

// ========== Tab: 角色管理（管理员） ==========
const RolesTab: React.FC = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RoleInfo | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/api/roles');
      if (d.success) setRoles(d.data?.items || d.data?.list || d.data || []);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...values, id: editing.id } : values;
      const d = await apiFetch('/api/roles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (d.success) { message.success(editing ? '角色已更新' : '角色已创建'); setModalOpen(false); form.resetFields(); setEditing(null); load(); }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      const d = await apiFetch(`/api/roles?id=${id}`, { method: 'DELETE' });
      if (d.success) { message.success('已删除'); load(); }
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '角色名', dataIndex: 'name', width: isMobile ? 80 : undefined },
    ...(!isMobile ? [
      { title: '编码', dataIndex: 'code', width: 120 },
      { title: '备注', dataIndex: 'remark', ellipsis: true },
      { title: '成员数', dataIndex: 'userCount', width: 80, render: (v: number) => <Tag>{v || 0}</Tag> },
    ] : []),
    {
      title: '状态', dataIndex: 'status', width: isMobile ? 60 : 80,
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作', width: isMobile ? 80 : 150, fixed: 'right' as const,
      render: (_: any, record: RoleInfo) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card styles={{ body: { padding: isMobile ? 8 : 16 } }}>
      <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 16 }} block={isMobile} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
        新建角色
      </Button>
      <Table columns={columns} dataSource={roles} loading={loading} rowKey="id" size="small"
        scroll={{ x: isMobile ? 400 : undefined }}
        pagination={{ pageSize: 20, size: isMobile ? 'small' : 'default' }} />
      <Modal title={editing ? '编辑角色' : '新建角色'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} destroyOnClose
        width={isMobile ? '95%' : 520}>
        <Form form={form} layout="vertical">
          <Form.Item label="角色名" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="编码" name="code" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item label="备注" name="remark"><Input.TextArea rows={isMobile ? 2 : 3} /></Form.Item>
          <Form.Item label="状态" name="status" initialValue={1}>
            <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

// ========== Tab: 系统设置（管理员） ==========
const SystemTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/settings/system')
      .then(d => { if (d.success) form.setFieldsValue(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const d = await apiFetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (d.success) message.success('系统设置已保存');
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <Card loading={loading}>
      <Form form={form} layout="vertical">
        <Form.Item label="系统名称" name="companyName"><Input placeholder="云仓智能仓储管理平台" /></Form.Item>
        <Form.Item label="联系电话" name="contactPhone"><Input /></Form.Item>
        <Form.Item label="联系邮箱" name="contactEmail"><Input /></Form.Item>
        <Form.Item label="库存预警天数" name="lowStockAlertDays"><InputNumber min={1} max={90} /></Form.Item>
        <Divider />
        <Form.Item label="自动备份" name="autoBackupEnabled" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item label="备份计划（Cron）" name="backupSchedule"><Input placeholder="0 2 * * *" /></Form.Item>
        <Form.Item label="备份保留天数" name="backupRetentionDays"><InputNumber min={1} max={365} /></Form.Item>
        <Button type="primary" onClick={handleSave} loading={loading}>保存</Button>
      </Form>
    </Card>
  );
};

// ========== Tab: 操作日志（管理员） ==========
const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ entityType: '', action: '', keyword: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.action) params.set('action', filters.action);
      if (filters.keyword) params.set('keyword', filters.keyword);
      const d = await apiFetch(`/api/operation-logs?${params}`);
      if (d.success) { setLogs(d.data?.items || d.data || []); setTotal(d.data?.total || 0); }
    } catch {}
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(page); }, [load, page]);

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '操作人', dataIndex: ['user', 'realName'], render: (_: any, r: LogEntry) => r.user?.realName || r.user?.username || '-' },
    { title: '操作', dataIndex: 'action', width: 100 },
    { title: '类型', dataIndex: 'entityType', width: 100 },
    { title: '对象ID', dataIndex: 'entityId', width: 80 },
    { title: 'IP', dataIndex: 'ipAddress', width: 120 },
    { title: '时间', dataIndex: 'createdAt', width: 180, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    {
      title: '详情',
      render: (_: any, r: LogEntry) => (
        <Button size="small" onClick={() => Modal.info({
          title: `操作详情 #${r.id}`,
          width: 600,
          content: (
            <div>
              <p><b>操作:</b> {r.action} {r.entityType} #{r.entityId}</p>
              <p><b>操作人:</b> {r.user?.realName} ({r.ipAddress})</p>
              <p><b>时间:</b> {r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-'}</p>
              <p><b>UserAgent:</b> {r.userAgent || '-'}</p>
              {r.oldData && <p><b>变更前:</b> <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>{r.oldData}</pre></p>}
              {r.newData && <p><b>变更后:</b> <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 8 }}>{r.newData}</pre></p>}
            </div>
          ),
        })}>查看</Button>
      ),
    },
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="操作类型" style={{ width: 120 }} value={filters.action || undefined}
          onChange={(v) => setFilters(f => ({ ...f, action: v || '' }))}
          options={[{ label: '创建', value: 'CREATE' }, { label: '更新', value: 'UPDATE' }, { label: '删除', value: 'DELETE' }]} />
        <Select allowClear placeholder="对象类型" style={{ width: 120 }} value={filters.entityType || undefined}
          onChange={(v) => setFilters(f => ({ ...f, entityType: v || '' }))}
          options={[{ label: '商品', value: 'product' }, { label: '库存', value: 'inventory' }, { label: '入库单', value: 'inbound' }, { label: '出库单', value: 'outbound' }, { label: '用户', value: 'user' }]} />
        <Input.Search placeholder="关键词搜索" style={{ width: 200 }}
          onSearch={(v) => setFilters(f => ({ ...f, keyword: v }))} />
      </Space>
      <Table columns={columns} dataSource={logs} loading={loading} rowKey="id" size="small"
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }} />
    </Card>
  );
};

// ========== Main: Settings Page ==========
const SettingsPage: React.FC = () => {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is admin
    apiFetch('/api/users')
      .then(d => { if (d.success) setIsAdmin(true); })
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  // ====== API安全 Tab ======
  if (loading) return <div style={{ padding: 50, textAlign: 'center' }}><Spin size="large" /></div>;

  const items = [
    { key: 'profile', label: '👤 个人资料', children: <ProfileTab /> },
    { key: 'password', label: '🔑 修改密码', children: <PasswordTab /> },
    ...(isAdmin ? [
      { key: 'users', label: '👥 用户管理', children: <UsersTab /> },
      { key: 'roles', label: '🎭 角色管理', children: <RolesTab /> },
      { key: 'system', label: <span><SettingOutlined /> 系统设置</span>, children: <SystemTab /> },
    ] : []),
  ];

  return (
    <div style={{ padding: 24 }}>
      <Tabs items={items} defaultActiveKey="profile" />
    </div>
  );
};

export default SettingsPage;
