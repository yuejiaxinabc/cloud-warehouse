'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Input, Modal, Form, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

export default function SuppliersPage() {
  const [data, setData] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const fetchData = async (p = page, kw = keyword) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers?page=${p}&pageSize=20&keyword=${kw}`);
      const json = await res.json();
      if (json.success) { setData(json.data?.items || []); setTotal(json.data?.total || 0); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { fetchData(); }, []);

  const handleAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const handleEdit = (record: any) => { setEditing(record); form.setFieldsValue(record); setModalOpen(true); };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/suppliers?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { message.success('删除成功'); fetchData(); }
      else message.error(json.error || '删除失败');
    } catch { message.error('删除失败'); }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...values, id: editing.id } : values;
      const res = await fetch('/api/suppliers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (json.success) { message.success(editing ? '修改成功' : '添加成功'); setModalOpen(false); fetchData(); }
      else message.error(json.error || '操作失败');
    } catch (e: any) { if (!e.errorFields) message.error('操作失败'); }
  };

  const columns = [
    { title: '编码', dataIndex: 'code', width: isMobile ? 70 : 100 },
    { title: '名称', dataIndex: 'name', width: isMobile ? 100 : 200 },
    ...(!isMobile ? [
      { title: '联系人', dataIndex: 'contact', width: 100 },
      { title: '电话', dataIndex: 'phone', width: 140 },
      { title: '邮箱', dataIndex: 'email', width: 180 },
      { title: '地址', dataIndex: 'address', width: 200, ellipsis: true },
    ] : []),
    { title: '状态', dataIndex: 'status', width: isMobile ? 60 : 80, render: (s: number) => <Tag color={s === 1 ? 'green' : 'red'}>{s === 1 ? '启用' : '停用'}</Tag> },
    {
      title: '操作', key: 'action', width: isMobile ? 100 : 150, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>{isMobile ? '' : '编辑'}</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>{isMobile ? '' : '删除'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A' }}>供应商管理</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="搜索供应商"
            allowClear
            onSearch={(v) => { setKeyword(v); fetchData(1, v); }}
            style={{ width: isMobile ? 140 : 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增</Button>
        </div>
      </div>

      <Card styles={{ body: { padding: isMobile ? 8 : 16 } }}>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          size="small"
          scroll={{ x: isMobile ? 400 : undefined }}
          pagination={{ current: page, total, pageSize: 20, onChange: (p) => { setPage(p); fetchData(p); }, size: isMobile ? 'small' : 'default' }}
        />
      </Card>

      <Modal
        title={editing ? '编辑供应商' : '新增供应商'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        width={isMobile ? '95%' : 520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input placeholder="如: SUP001" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="供应商名称" />
          </Form.Item>
          <Form.Item name="contact" label="联系人"><Input /></Form.Item>
          <Form.Item name="phone" label="电话"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
