'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Input, Modal, Form, InputNumber, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, DownloadOutlined, CheckOutlined, PrinterOutlined, EditOutlined, DeleteOutlined, ImportOutlined } from '@ant-design/icons';

// 状态流转：待采购(PENDING) → 已采购(PURCHASING) → 采购完成(COMPLETED) → 入库(inboundOrderId)
const STATUS_MAP: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待采购', color: 'orange' },
  PURCHASING: { text: '已采购', color: 'blue' },
  COMPLETED: { text: '采购完成', color: 'green' },
  CANCELLED: { text: '已取消', color: 'default' },
};

// 打印采购单：新窗口渲染打印版式
function printRequest(r: any) {
  const row = (label: string, value: string) =>
    `<tr><th>${label}</th><td>${value || '-'}</td></tr>`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>采购单 ${r.requestNo}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #111; margin: 40px; }
  h1 { font-size: 22px; text-align: center; letter-spacing: 6px; margin-bottom: 4px; }
  .sub { text-align: center; color: #666; font-size: 12px; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid #333; padding: 9px 12px; text-align: left; }
  th { width: 110px; background: #f5f5f5; }
  .sign { margin-top: 48px; display: flex; justify-content: space-between; font-size: 13px; }
  .sign span { display: inline-block; min-width: 180px; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<h1>采 购 单</h1>
<div class="sub">单号：${r.requestNo}</div>
<table>
  ${row('备件名称', r.name)}
  ${row('型号', r.model)}
  ${row('颜色', r.color)}
  ${row('尺寸', r.size)}
  ${row('数量', r.quantity != null ? String(Number(r.quantity)) : '')}
  ${row('申请人', r.applicant)}
  ${row('申请时间', r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }) : '')}
  ${row('状态', STATUS_MAP[r.status]?.text || r.status)}
  ${row('备注', r.remark)}
</table>
<div class="sign">
  <span>申请人签字：______________</span>
  <span>审批签字：______________</span>
</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { message.error('浏览器拦截了打印窗口，请允许弹窗后重试'); return; }
  win.document.write(html);
  win.document.close();
}

export default function PurchaseRequestsPage() {
  const [data, setData] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);

  // 新增/编辑申请
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  // 入库弹窗
  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [inboundTarget, setInboundTarget] = useState<any>(null);
  const [inboundForm] = Form.useForm();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);

  const fetchData = async (p = page, kw = keyword, st = statusFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/purchase-requests?page=${p}&pageSize=20&keyword=${encodeURIComponent(kw)}&status=${st}`);
      const json = await res.json();
      if (json.success) { setData(json.data?.items || []); setTotal(json.data?.total || 0); }
      else message.error(json.error || '加载失败');
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { fetchData(); }, []);

  const fetchWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouse');
      const json = await res.json();
      if (json.success) setWarehouses(json.data || []);
    } catch {}
  };

  const fetchLocations = async (warehouseId: number) => {
    setLocations([]);
    setBoxes([]);
    try {
      const res = await fetch(`/api/warehouse/locations?warehouseId=${warehouseId}`);
      const json = await res.json();
      if (json.success) setLocations(json.data || []);
    } catch {}
  };

  const fetchBoxes = async (locationId: number) => {
    setBoxes([]);
    try {
      const res = await fetch(`/api/warehouse/boxes?locationId=${locationId}`);
      const json = await res.json();
      if (json.success) setBoxes(json.data || []);
    } catch {}
  };

  // ===== 新增/编辑 =====
  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ quantity: 1 });
    setFormModalOpen(true);
  };

  const handleEdit = (r: any) => {
    setEditing(r);
    form.setFieldsValue({
      name: r.name, model: r.model, color: r.color, size: r.size,
      quantity: Number(r.quantity), remark: r.remark,
    });
    setFormModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const url = editing ? `/api/purchase-requests/${editing.id}` : '/api/purchase-requests';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (json.success) {
        message.success(editing ? '修改成功' : '申请已提交');
        setFormModalOpen(false);
        fetchData();
      } else message.error(json.error || '操作失败');
    } catch (e: any) {
      if (!e.errorFields) message.error('操作失败');
    }
  };

  // ===== 状态流转 =====
  const handleAction = async (r: any, action: 'purchase' | 'complete') => {
    try {
      const res = await fetch(`/api/purchase-requests/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) { message.success(action === 'purchase' ? '已标记为已采购' : '已标记为采购完成'); fetchData(); }
      else message.error(json.error || '操作失败');
    } catch { message.error('操作失败'); }
  };

  // ===== 入库 =====
  const openInbound = (r: any) => {
    setInboundTarget(r);
    inboundForm.resetFields();
    fetchWarehouses();
    setInboundModalOpen(true);
  };

  const handleInboundOk = async () => {
    try { await inboundForm.validateFields(); } catch { return; }
    const values = inboundForm.getFieldsValue();
    try {
      const res = await fetch(`/api/purchase-requests/${inboundTarget.id}/inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: values.warehouseId,
          locationId: values.locationId,
          boxId: values.boxId,
          unitCost: values.unitCost,
        }),
      });
      const json = await res.json();
      if (json.success) { message.success(json.message || '入库成功'); setInboundModalOpen(false); fetchData(); }
      else message.error(json.error || '入库失败');
    } catch { message.error('入库失败'); }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/purchase-requests/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { message.success('删除成功'); fetchData(); }
      else message.error(json.error || '删除失败');
    } catch { message.error('删除失败'); }
  };

  // ===== 批量下载 =====
  const handleBatchDownload = async () => {
    if (selectedIds.length === 0) { message.warning('请先勾选要下载的申请单'); return; }
    try {
      const res = await fetch('/api/purchase-requests/batch-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        message.error(json.error || '下载失败');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'purchase_requests.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      message.success(`已下载 ${selectedIds.length} 条申请单`);
    } catch { message.error('下载失败'); }
  };

  const columns = [
    { title: '申请单号', dataIndex: 'requestNo', width: isMobile ? 90 : 140 },
    { title: '备件名称', dataIndex: 'name', width: isMobile ? 90 : 150 },
    ...(!isMobile ? [
      { title: '型号', dataIndex: 'model', width: 110, render: (v: any) => v || '-' },
      { title: '颜色', dataIndex: 'color', width: 70, render: (v: any) => v || '-' },
      { title: '尺寸', dataIndex: 'size', width: 70, render: (v: any) => v || '-' },
    ] : []),
    { title: '数量', dataIndex: 'quantity', width: 60, render: (v: any) => Number(v) },
    ...(!isMobile ? [
      { title: '申请人', dataIndex: 'applicant', width: 80, render: (v: any) => v || '-' },
      { title: '入库信息', key: 'inbound', width: 170, render: (_: any, r: any) => {
          if (r.inboundOrder) return <Tag color="green">{r.inboundOrder.orderNo}</Tag>;
          if (r.warehouse) return <span style={{ fontSize: 12 }}>{r.box?.code || r.location?.code || ''}（待入库）</span>;
          return '-';
        } },
    ] : []),
    { title: '状态', dataIndex: 'status', width: isMobile ? 70 : 80, render: (s: string) => {
        const info = STATUS_MAP[s] || { text: s, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      } },
    {
      title: '操作', key: 'action', width: isMobile ? 110 : 260, fixed: 'right' as const,
      render: (_: any, r: any) => (
        <Space size={0} wrap>
          {/* 待采购 → 已采购 */}
          {r.status === 'PENDING' && (
            <Popconfirm title="确认已采购？" onConfirm={() => handleAction(r, 'purchase')}>
              <Button type="link" size="small" icon={<CheckOutlined />}>{isMobile ? '' : '标记已采购'}</Button>
            </Popconfirm>
          )}
          {/* 已采购 → 采购完成 */}
          {r.status === 'PURCHASING' && (
            <Popconfirm title="确认采购完成？" onConfirm={() => handleAction(r, 'complete')}>
              <Button type="link" size="small" icon={<CheckOutlined />}>{isMobile ? '' : '采购完成'}</Button>
            </Popconfirm>
          )}
          {/* 采购完成 → 入库 */}
          {r.status === 'COMPLETED' && !r.inboundOrderId && (
            <Button type="link" size="small" icon={<ImportOutlined />} onClick={() => openInbound(r)}>
              {isMobile ? '' : '入库'}
            </Button>
          )}
          <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => printRequest(r)}>
            {isMobile ? '' : '打印'}
          </Button>
          {r.status !== 'COMPLETED' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>{isMobile ? '' : '编辑'}</Button>
          )}
          <Popconfirm title="确认删除该申请？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>{isMobile ? '' : '删除'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A' }}>购买申请</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input.Search
            placeholder="搜索单号/名称/型号/申请人"
            allowClear
            onSearch={(v) => { setKeyword(v); fetchData(1, v, statusFilter); }}
            style={{ width: isMobile ? 130 : 200 }}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: isMobile ? 90 : 110 }}
            value={statusFilter || undefined}
            onChange={(v) => { setStatusFilter(v || ''); fetchData(1, keyword, v || ''); }}
            options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.text }))}
          />
          <Button icon={<DownloadOutlined />} onClick={handleBatchDownload}>
            批量下载{!isMobile && selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增申请</Button>
        </div>
      </div>

      <Card styles={{ body: { padding: isMobile ? 8 : 16 } }}>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          size="small"
          scroll={{ x: isMobile ? 500 : undefined }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys),
          }}
          pagination={{ current: page, total, pageSize: 20, onChange: (p) => { setPage(p); fetchData(p); }, size: isMobile ? 'small' : 'default' }}
        />
      </Card>

      {/* 新增/编辑申请 */}
      <Modal
        title={editing ? '编辑申请' : '新增备件购买申请'}
        open={formModalOpen}
        onCancel={() => setFormModalOpen(false)}
        onOk={handleSave}
        width={isMobile ? '95%' : 520}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="备件名称" rules={[{ required: true, message: '请输入备件名称' }]}>
            <Input placeholder="如：伺服电机" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="model" label="型号"><Input placeholder="如：SM-400F" /></Form.Item>
            <Form.Item name="color" label="颜色"><Input placeholder="如：黑色" /></Form.Item>
            <Form.Item name="size" label="尺寸"><Input placeholder="如：100×50mm" /></Form.Item>
            <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 入库 */}
      <Modal
        title="采购入库"
        open={inboundModalOpen}
        onCancel={() => setInboundModalOpen(false)}
        onOk={handleInboundOk}
        okText="确认入库"
        width={isMobile ? '95%' : 480}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: '#475569' }}>
          {inboundTarget?.requestNo} — {inboundTarget?.name}
          {inboundTarget?.model ? `（${inboundTarget.model}）` : ''} × {inboundTarget ? Number(inboundTarget.quantity) : ''}
        </div>
        <Form form={inboundForm} layout="vertical" preserve={false}>
          <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true, message: '请选择仓库' }]}>
            <Select
              placeholder="选择仓库"
              showSearch
              optionFilterProp="label"
              onChange={(v) => { fetchLocations(v); inboundForm.setFieldValue('locationId', undefined); inboundForm.setFieldValue('boxId', undefined); }}
              options={warehouses.map((w: any) => ({ value: Number(w.id), label: w.name }))}
            />
          </Form.Item>
          <Form.Item name="locationId" label="入库货位（货架-排-列）" rules={[{ required: true, message: '请选择货位' }]}>
            <Select
              placeholder="先选仓库，再选货位"
              showSearch
              optionFilterProp="label"
              onChange={(v) => { fetchBoxes(v); inboundForm.setFieldValue('boxId', undefined); }}
              options={locations.map((l: any) => ({ value: Number(l.id), label: l.code }))}
            />
          </Form.Item>
          <Form.Item name="boxId" label="入库盒子（货架-排-列-盒）" rules={[{ required: true, message: '请选择盒子' }]}>
            <Select
              placeholder="先选货位，再选盒子"
              showSearch
              optionFilterProp="label"
              options={boxes.map((b: any) => ({ value: Number(b.id), label: b.code }))}
            />
          </Form.Item>
          <Form.Item name="unitCost" label="单价（选填）">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="用于计算库存成本" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
