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
  EditOutlined, DeleteOutlined, KeyOutlined, PlusOutlined, SendOutlined,
  CloudDownloadOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import MailSettings from '@/components/settings/MailSettings';
import UpdateTab from '@/components/settings/UpdateTab';
import { settingsRequest, settingsList } from '@/components/settings/request';

const { TabPane } = Tabs;

// ========== Types ==========
interface UserInfo {
  id: number; username: string; realName: string; phone: string;
  email: string; status: number; emailVerified: boolean;
  roles: { id: number; name: string; code: string }[];
  roleIds?: number[];
  orgId?: number | null;
}
interface RoleInfo {
  id: number; name: string; code: string; remark: string;
  status: number; userCount: number;
  // v1.2.3 数据权限
  dataScope?: string;
  dataScopeOrgIds?: number[];
  permissionIds?: number[];
  rolePermissions: { permission: { id: number; name: string; code: string } }[];
}

/** v1.2.3 数据范围档位（宽 → 窄） */
const DATA_SCOPE_OPTIONS = [
  { label: '全部数据', value: 'ALL' },
  { label: '本部门及下级', value: 'DEPT_AND_CHILD' },
  { label: '本部门', value: 'DEPT' },
  { label: '指定组织', value: 'CUSTOM' },
  { label: '仅本人经手', value: 'SELF' },
];
const DATA_SCOPE_LABEL: Record<string, { text: string; color: string }> = {
  ALL: { text: '全部数据', color: 'blue' },
  DEPT_AND_CHILD: { text: '本部门及下级', color: 'cyan' },
  DEPT: { text: '本部门', color: 'green' },
  CUSTOM: { text: '指定组织', color: 'purple' },
  SELF: { text: '仅本人', color: 'orange' },
};
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
const apiFetch = settingsRequest;

// ========== Tab: 个人资料 ==========
const ProfileTab: React.FC = () => {
  const [form] = Form.useForm();
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  // v1.2.1（P1-6）：保存成功后要让右上角会话里的姓名/邮箱同步更新
  const { update: updateSession } = useSession();
  
  
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
      if (d.success) {
        message.success('保存成功');
        // 回填服务端实际值（后端可能做过 trim/规整）
        if (d.data) form.setFieldsValue(d.data);
        // v1.2.1（P1-6）：刷新 session 与页面数据，否则顶部仍显示旧姓名
        try { await updateSession?.(); } catch { /* session 刷新失败不影响保存结果 */ }
        router.refresh();
      }
    } catch (e: any) { message.error(e.message || '保存失败'); }
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
  // v1.2.3：用户归属组织（数据权限 DEPT / DEPT_AND_CHILD 的前提）
  const [orgOptions, setOrgOptions] = useState<{label: string; value: number}[]>([]);
  const [optionsReady, setOptionsReady] = useState(false);
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
      setOptionsReady(false);
      const [users, roles, orgs] = await Promise.all([
        settingsList('/api/users'), settingsList('/api/roles'), settingsList('/api/organizations'),
      ]);
      setUsers(users.map(u => ({ ...u, roleIds: u.roleIds || (u.roles || []).map((r: any) => Number(r.id)) })));
      setRoles(roles);
      setOrgOptions(orgs.map(o => ({label: o.name, value: Number(o.id)})));
      setOptionsReady(true);
    } catch (e: any) { message.error(e.message || '用户配置加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `/api/users?id=${editing.id}` : '/api/users';
      if (!optionsReady) throw new Error("角色和组织尚未加载，请刷新列表重试");
      const body = { ...values, roleIds: values.roleIds || [], orgId: values.orgId ?? null };
      // Lists mask contact fields: leaving them blank preserves the original value.
      if (editing && !values.phone) delete body.phone;
      if (editing && !values.email) delete body.email;
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

  
  const [tokenModal, setTokenModal] = useState({ open: false, token: "", expiresAt: "", username: "" });
  const [issueOpen, setIssueOpen] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenForm] = Form.useForm();
  const handleSetGlobalToken = async () => {
    try {
      const values = await tokenForm.validateFields();
      setTokenBusy(true);
      const d = await apiFetch("/api/auth/admin-reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-token", ...values }),
      });
      if (!d.data?.token || !d.data?.expiresAt || !d.data?.username) throw new Error("令牌响应不完整，请联系管理员");
      setTokenModal({open: true, token: d.data.token, expiresAt: d.data.expiresAt, username: d.data.username});
      setIssueOpen(false);
      tokenForm.resetFields();
      message.success("一次性重置令牌已签发");
    } catch (e: any) { if (!e.errorFields) message.error(e.message || "签发失败，请重试"); }
    finally { setTokenBusy(false); }
  };
  const clearResetToken = async () => {
    try {
      await apiFetch("/api/auth/admin-reset", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action: "clear-token"})});
      setTokenModal({open: false, token: "", expiresAt: "", username: ""});
      message.success("重置令牌已撤销");
    } catch (e: any) { message.error(e.message || "撤销失败"); }
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
      title: '操作', width: 150, fixed: 'right' as const,
      render: (_: any, record: UserInfo) => (
        <Space size={4}>
          <Button type="link" size="small" disabled={!optionsReady} aria-label="编辑用户" icon={<EditOutlined />} onClick={() => { setEditing(record); form.resetFields(); form.setFieldsValue({ ...record, phone: "", email: "" }); setModalOpen(true); }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Button disabled={!optionsReady} type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          新建用户
        </Button>
        <Button icon={<KeyOutlined />} onClick={() => {tokenForm.resetFields(); setIssueOpen(true);}}>签发重置令牌</Button>
        <Popconfirm title="撤销当前签发的重置令牌？" onConfirm={clearResetToken}><Button danger>撤销重置令牌</Button></Popconfirm>
      </div>
      <Table columns={columns} dataSource={users} loading={loading} rowKey="id" size="small" scroll={{ x: isMobile ? 800 : undefined }}
            pagination={{ pageSize: 20 }} />
      <Modal title={editing ? '编辑用户' : '新建用户'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} confirmLoading={loading} okButtonProps={{disabled: !optionsReady}} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item label="用户名" name="username" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          {!editing && <Form.Item label="密码" name="password" rules={[{ required: true, min: 8 }]}><Input.Password /></Form.Item>}
          <Form.Item label="姓名" name="realName" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="手机号" name="phone" extra={editing ? "留空保留原手机号" : undefined}><Input maxLength={20} /></Form.Item>
          <Form.Item label="邮箱" name="email" extra={editing ? "留空保留原邮箱" : undefined} rules={[{type:"email", message:"请输入有效邮箱"},{max:100}]}><Input maxLength={100} /></Form.Item>
          <Form.Item label="分配角色" name="roleIds" initialValue={[]} extra="可选择多个角色；清空表示移除全部角色">
            <Select mode="multiple" allowClear options={roles.map(r => ({label: r.name + "（" + r.code + "）", value: Number(r.id)}))} />
          </Form.Item>
          <Form.Item label="归属组织" name="orgId" extra="数据权限的「本部门 / 本部门及以下」按此生效">
            <Select allowClear placeholder="未划分" options={orgOptions} />
          </Form.Item>
          <Form.Item label="状态" name="status" initialValue={1}>
            <Select options={[{ label: '启用', value: 1 }, { label: '禁用', value: 0 }]} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="签发一次性重置令牌" open={issueOpen} onOk={handleSetGlobalToken} confirmLoading={tokenBusy} onCancel={() => setIssueOpen(false)}>
        <Alert type="info" showIcon message="短时有效，成功重置一次后失效；重新签发将替换当前令牌。" />
        <Form form={tokenForm} layout="vertical" initialValues={{ttlHours: 1}}>
          <Form.Item name="username" label="目标账号" rules={[{required: true, whitespace: true}]}><Input maxLength={100} /></Form.Item>
          <Form.Item name="ttlHours" label="有效期（小时）" rules={[{required:true}]}><InputNumber min={1} max={24} /></Form.Item>
        </Form>
      </Modal>
      <Modal title="一次性重置令牌" open={tokenModal.open} onCancel={() => setTokenModal({open:false,token:"",expiresAt:"",username:""})} footer={<Button onClick={async () => {
        try { await navigator.clipboard.writeText(tokenModal.token); message.success("已复制"); }
        catch { message.error("复制失败，请手动选择令牌复制"); }
      }}>复制令牌</Button>}>
        <p>目标账号：{tokenModal.username}</p>
        <p style={{wordBreak:"break-all",fontFamily:"monospace",userSelect:"all"}}>{tokenModal.token}</p>
        <p>到期时间：{tokenModal.expiresAt ? new Date(tokenModal.expiresAt).toLocaleString('zh-CN') : '—'}</p>
        <p>仅用于上述账号，成功重置一次后立即失效。只向经核实的目标用户传递；不再使用时请撤销。</p>
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
  const [permissionOptions, setPermissionOptions] = useState<{label:string; value:number}[]>([]);
  const [permissionsReady, setPermissionsReady] = useState(false);
  // v1.2.3：数据范围选「指定组织」时需要组织树
  const [orgOptions, setOrgOptions] = useState<{ label: string; value: number }[]>([]);
  // v1.2.3：直接用 Form 的值驱动「指定组织」显隐，避免再维护一份 state
  const scopeMode: string = ((Form.useWatch('dataScope', form) as string) || 'ALL');

  useEffect(() => {
    apiFetch('/api/organizations')
      .then((d) => {
        const list = d?.data?.list || [];
        setOrgOptions(list.map((o: any) => ({ label: o.name, value: o.id })));
      })
      .catch((e: Error) => message.error(e.message));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPermissionsReady(false);
      const d = await apiFetch('/api/roles?pageSize=100');
      if (!Array.isArray(d.data?.permissionOptions)) throw new Error('权限目录加载失败，请确认服务端版本');
      setPermissionOptions(d.data.permissionOptions.map((p: any) => ({label: p.name + '（' + p.code + '）', value: Number(p.id)})));
      const allRoles = await settingsList('/api/roles');
      setPermissionsReady(true);
      if (d.success) {
        const list = allRoles;
        // v1.2.3：dataScopeOrgIds 在库里是逗号串，编辑表单里要用多选数组
        setRoles(list.map((r: any) => ({
          ...r,
          remark: r.remark ?? r.remarks ?? r.description ?? "",
          permissionIds: r.permissionIds || (r.permissions || []).map((p: any) => Number(p.id)),
          dataScopeOrgIds: String(r.dataScopeOrgIds || '')
            .split(',')
            .map((x: string) => Number(x))
            .filter((n: number) => Number.isFinite(n) && n > 0),
        })));
      }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const method = editing ? 'PUT' : 'POST';
      // v1.2.3：数据范围随角色一起提交，CUSTOM 才传组织 id 数组
      if (!permissionsReady) throw new Error("权限目录尚未加载，请重试");
      const payload: any = { code: values.code, name: values.name, status: values.status, dataScope: values.dataScope, dataScopeOrgIds: values.dataScopeOrgIds, remark: values.remark || "", description: values.remark || "", permissionIds: values.permissionIds || [] };
      if (payload.dataScope === 'CUSTOM') {
        payload.dataScopeOrgIds = payload.dataScopeOrgIds || [];
      } else {
        delete payload.dataScopeOrgIds;
      }
      const body = editing ? { ...payload, id: editing.id } : payload;
      const d = await apiFetch(editing ? `/api/roles?id=${editing.id}` : '/api/roles', {
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
      {
        title: '数据范围', dataIndex: 'dataScope', width: 130,
        render: (v: string) => {
          const meta = DATA_SCOPE_LABEL[v || 'ALL'] || DATA_SCOPE_LABEL.ALL;
          return <Tag color={meta.color}>{meta.text}</Tag>;
        },
      },
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditing(record); form.resetFields(); form.setFieldsValue(record); setModalOpen(true); }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
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
      <Modal title={editing ? '编辑角色' : '新建角色'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} destroyOnClose confirmLoading={loading} okButtonProps={{disabled: !permissionsReady}}
        width={isMobile ? '95%' : 520}>
        <Form form={form} layout="vertical">
          <Form.Item label="角色名" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="编码" name="code" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Form.Item label="备注" name="remark"><Input.TextArea rows={isMobile ? 2 : 3} /></Form.Item>
          <Form.Item label="操作权限" name="permissionIds" initialValue={[]} extra="仅授予所选操作权限；清空表示不授予任何操作权限">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" disabled={!permissionsReady} options={permissionOptions} />
          </Form.Item>
          <Form.Item
            label="数据范围"
            name="dataScope"
            initialValue="ALL"
            extra="决定该角色能看到哪些仓库与单据；一人多角色时取最宽的一档"
          >
            <Select options={DATA_SCOPE_OPTIONS} />
          </Form.Item>
          {scopeMode === 'CUSTOM' && (
            <Form.Item label="可见组织" name="dataScopeOrgIds" extra="只统计这些组织下的仓库">
              <Select mode="multiple" allowClear placeholder="选择组织" options={orgOptions} />
            </Form.Item>
          )}
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
      .catch((e: Error) => message.error(e.message))
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
    } catch (e: any) { message.error(e.message || '加载失败，请重试'); }
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
/** 允许用 /settings?tab=update 直达某个页签（侧栏「发现新版本」就靠这个） */
function readDefaultTab(isAdmin: boolean): string {
  if (typeof window === 'undefined') return isAdmin ? 'system' : 'profile';
  const tab = new URLSearchParams(window.location.search).get('tab');
  const allowed = ['profile', 'password', 'users', 'roles', 'system', 'mail', 'update'];
  if (tab && allowed.includes(tab)) {
    if (!isAdmin && ['users', 'roles', 'system', 'mail', 'update'].includes(tab)) return 'profile';
    return tab;
  }
  return isAdmin ? 'system' : 'profile';
}

const SettingsPage: React.FC = () => {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [defaultTab, setDefaultTab] = useState<string>('profile');

  useEffect(() => { setDefaultTab(readDefaultTab(isAdmin)); }, [isAdmin]);

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
    { key: 'profile', label: <span><UserOutlined /> 个人资料</span>, children: <ProfileTab /> },
    { key: 'password', label: <span><KeyOutlined /> 修改密码</span>, children: <PasswordTab /> },
    ...(isAdmin ? [
      { key: 'users', label: <span><TeamOutlined /> 用户管理</span>, children: <UsersTab /> },
      { key: 'roles', label: <span><SettingOutlined /> 角色管理</span>, children: <RolesTab /> },
      { key: 'system', label: <span><SettingOutlined /> 系统设置</span>, children: <SystemTab /> },
      { key: 'mail', label: <span><MailOutlined /> 邮件与订阅</span>, children: <MailSettings /> },
      { key: 'update', label: <span><CloudDownloadOutlined /> 检查更新</span>, children: <UpdateTab /> },
    ] : []),
  ];

  return (
    <div style={{ padding: 24 }}>
      <h4 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>设置</h4>
      {/* 默认打开系统设置（管理员）；非管理员没有系统设置页，默认打开个人资料。
          支持 /settings?tab=update —— 侧栏「发现新版本」的提示点进来直接落在检查更新。 */}
      <Tabs items={items} defaultActiveKey={defaultTab} />
    </div>
  );
};

export default SettingsPage;
