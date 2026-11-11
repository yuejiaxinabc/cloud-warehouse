'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { settingsRequest, settingsList } from '@/components/settings/request';

type Organization = {id:number; name:string; code:string; parentId:number|null; ancestors:string; status:number; remark:string|null};
export default function OrganizationsPage() {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Organization|null>(null);
  const [form] = Form.useForm();
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await settingsList('/api/organizations')); }
    catch (e) { setError(e instanceof Error ? e.message : '组织加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const edit = (row: Organization|null) => {
    setEditing(row); form.resetFields();
    form.setFieldsValue(row ? {...row, parentId:row.parentId ?? undefined} : {status:1}); setOpen(true);
  };
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      const payload = {...values, parentId: values.parentId ?? null, ...(editing ? {id:editing.id} : {})};
      await settingsRequest('/api/organizations', {method:editing ? 'PUT':'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      message.success(editing ? '组织已更新':'组织已创建'); setOpen(false); await load();
    } catch (e: any) { if (!e.errorFields) message.error(e.message || '保存失败'); }
    finally {setSaving(false);}
  };
  const remove = async (id:number) => {
    try { await settingsRequest('/api/organizations?id=' + id, {method:'DELETE'}); message.success('组织已删除'); await load(); }
    catch (e: any) {message.error(e.message || '删除失败');}
  };
  const parentOptions = rows.filter(r => !editing || (r.id !== editing.id && !String(r.ancestors || '').split(',').includes(String(editing.id))))
    .map(r => ({label:r.name + '（' + r.code + '）', value:r.id}));
  return <div>
    <Typography.Title level={3}>组织管理</Typography.Title>
    <Card>
      <Space wrap style={{marginBottom:16}}><Button type="primary" onClick={() => edit(null)} disabled={loading || !!error}>新建组织</Button><Button onClick={load} loading={loading}>刷新列表</Button></Space>
      {error && <Alert type="error" showIcon message={error} style={{marginBottom:16}} />}
      <Table<Organization> rowKey="id" dataSource={rows} loading={loading} scroll={{x:720}} columns={[
        {title:'组织名称', dataIndex:'name'}, {title:'编码', dataIndex:'code'},
        {title:'上级组织', dataIndex:'parentId', render:(id:number|null) => rows.find(r => r.id === id)?.name || '顶级组织'},
        {title:'备注', dataIndex:'remark'},
        {title:'状态', dataIndex:'status', render:(v:number) => <Tag color={v === 1 ? 'green':'red'}>{v === 1 ? '启用':'禁用'}</Tag>},
        {title:'操作', render:(_, row) => <Space><Button disabled={!!error} onClick={() => edit(row)}>编辑</Button><Popconfirm title="确定删除组织？含子组织、用户或仓库的组织请先调整归属。" onConfirm={() => remove(row.id)}><Button danger disabled={!!error}>删除</Button></Popconfirm></Space>},
      ]} />
    </Card>
    <Modal title={editing ? '编辑组织':'新建组织'} open={open} onCancel={() => setOpen(false)} onOk={save} confirmLoading={saving}>
      <Form form={form} layout="vertical">
        <Form.Item name="name" label="组织名称" rules={[{required:true, whitespace:true}, {max:100}]}><Input maxLength={100} /></Form.Item>
        <Form.Item name="code" label="组织编码" rules={[{required:true, whitespace:true}, {max:50}]}><Input disabled={!!editing} maxLength={50} /></Form.Item>
        <Form.Item name="parentId" label="上级组织" extra="留空为顶级组织；自身及下级组织不可选"><Select allowClear options={parentOptions} /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea maxLength={500} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={[{label:'启用',value:1},{label:'禁用',value:0}]} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
