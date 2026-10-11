'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tag, Typography, Button, Space, message, Spin, Modal, Select, InputNumber, Form } from 'antd';
import { PrinterOutlined, CheckCircleOutlined, ArrowLeftOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';

const { Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  POSTED: { label: '已过账', color: 'green' },
  CANCELLED: { label: '已取消', color: 'red' },
};

export default function StockInDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [locationForm] = Form.useForm();
  const [assigning, setAssigning] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [locWarehouseId, setLocWarehouseId] = useState<number | null>(null);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [priceProductId, setPriceProductId] = useState<number | null>(null);

  useEffect(() => { if (id) fetchOrder(); }, [id]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stock-in/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setOrder(data.data);
      else message.error(data.error || '入库单不存在');
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  const loadWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouse', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch {}
  };

  const loadBoxes = async (warehouseId: number) => {
    try {
      const res = await fetch('/api/warehouse/structure?warehouseId=' + warehouseId, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) return;
      const allBoxes: any[] = [];
      for (const zone of data.data || []) {
        for (const loc of zone.locations || []) {
          for (const box of loc.boxes || []) {
            allBoxes.push(box);
          }
        }
      }
      setBoxes(allBoxes);
    } catch {}
  };

  const handlePost = () => {
    Modal.confirm({
      title: '确认过账',
      content: '过账后将更新库存，确定要过账吗？',
      onOk: async () => {
        setPosting(true);
        try {
          const res = await fetch(`/api/stock-in/${id}/post`, { method: 'POST' });
          const data = await res.json();
          if (data.success) { message.success('过账成功'); fetchOrder(); }
          else message.error(data.error || '过账失败');
        } catch { message.error('过账失败'); } finally { setPosting(false); }
      },
    });
  };

  const openLocationModal = () => {
    loadWarehouses();
    const whId = order?.warehouseId || order?.warehouse?.id;
    if (whId) {
      setLocWarehouseId(Number(whId));
      loadBoxes(Number(whId));
    }
    const items = order?.inboundItems || order?.items || [];
    const fields = items.map((item: any) => ({
      productId: Number(item.productId || item.product?.id),
      productName: item.product?.name || '-',
      quantity: Number(item.quantity || 0),
      boxId: undefined,
      locationId: undefined,
    }));
    locationForm.setFieldsValue({ items: fields, commonBox: undefined });
    setLocationModalOpen(true);
  };

  const handleSameBox = () => {
    const commonBox = locationForm.getFieldValue('commonBox');
    if (!commonBox) { message.warning('请先选择统一货位'); return; }
    const box = boxes.find((b: any) => b.id === commonBox);
    if (!box) return;
    const items = locationForm.getFieldValue('items') || [];
    const updated = items.map((item: any) => ({ ...item, boxId: commonBox, locationId: box.locationId }));
    locationForm.setFieldsValue({ items: updated });
  };

  const fetchPriceHistory = async (productId: number) => {
    setPriceProductId(productId);
    try {
      const res = await fetch(`/api/products/${productId}/price-history`);
      const data = await res.json();
      if (data.success) {
        const records = data.data?.records || data.data || [];
        setPriceHistory(Array.isArray(records) ? records : []);
        setPriceHistoryOpen(true);
      }
    } catch { message.error('加载价格历史失败'); }
  };

  const handleAssignLocations = async () => {
    try {
      const values = await locationForm.validateFields();
      const items = values.items || [];
      const toAssign = items.filter((i: any) => i.locationId);
      if (toAssign.length === 0) { message.warning('请至少为一个商品选择货位'); return; }

      setAssigning(true);
      let successCount = 0;
      for (const item of toAssign) {
        try {
          const res = await fetch('/api/location-stocks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: item.productId,
              warehouseId: order.warehouseId || order.warehouse?.id,
              locationId: item.locationId,
              boxId: item.boxId,
              quantity: item.quantity,
            }),
          });
          const resData = await res.json();
          if (!resData.success) {
            message.error(`商品 ${item.productName || ''} 分配失败: ${resData.error || '未知错误'}`);
          } else {
            successCount++;
          }
        } catch (e: any) { message.error(`商品分配异常: ${e.message || '网络错误'}`); }
      }

      if (successCount > 0) {
        message.success(`已分配 ${successCount} 个商品到货位`);
        setLocationModalOpen(false);
        fetchOrder();
      }
    } catch { message.error('分配失败'); } finally { setAssigning(false); }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win || !order) return;
    const items = order.inboundItems || order.items || [];
    win.document.write(`<!DOCTYPE html><html><head><title>入库单 - ${order.orderNo}</title><style>body{font-family:'SimSun',serif;padding:20px}h1{text-align:center;font-size:24px}.info{margin:20px 0}.info span{margin-right:30px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #000;padding:8px;text-align:left}th{background:#f0f0f0}.footer{margin-top:40px;display:flex;justify-content:space-between}.footer div{width:30%;text-align:center}@media print{body{padding:0}}</style></head><body><h1>入库单</h1><div class="info"><span>单号: ${order.orderNo}</span><span>仓库: ${order.warehouse?.name || '-'}</span><span>类型: ${order.type || '-'}</span><span>状态: ${statusMap[order.status]?.label || order.status}</span></div><table><thead><tr><th>序号</th><th>商品编码</th><th>商品名称</th><th>数量</th><th>单价</th><th>批次号</th></tr></thead><tbody>${items.map((it: any, i: number) => `<tr><td>${i+1}</td><td>${it.product?.code||'-'}</td><td>${it.product?.name||'-'}</td><td>${Number(it.quantity||0)}</td><td>${it.costPrice?'¥'+Number(it.costPrice).toFixed(2):'-'}</td><td>${it.lotNumber||'-'}</td></tr>`).join('')}</tbody></table><div class="footer"><div>制单人: ___</div><div>审核人: ___</div><div>收货人: ___</div></div><script>window.onload=function(){window.print()}</script></body></html>`);
    win.document.close();
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  if (!order) return <div style={{ textAlign: 'center', padding: 100 }}>入库单不存在</div>;

  const items = order.inboundItems || order.items || [];

  const itemColumns = [
    { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    { title: '商品编码', width: 120, render: (_: any, r: any) => r.product?.code || '-' },
    { title: '商品名称', width: 200, render: (_: any, r: any) => r.product?.name || '-' },
    { title: '数量', width: 100, render: (_: any, r: any) => Number(r.quantity || 0) },
    { title: '单价', width: 120, render: (_: any, r: any) => {
        const pid = Number(r.productId || r.product?.id);
        return r.costPrice ? <a onClick={() => fetchPriceHistory(pid)} style={{ cursor: 'pointer', color: '#1677ff' }}>¥{Number(r.costPrice).toFixed(2)}</a> : '-';
      } },
    { title: '批次号', width: 120, render: (_: any, r: any) => r.lotNumber || '-' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/stock-in')}>返回</Button>
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>入库单详情</h4>
        </Space>
        <Space wrap>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button>
          {order.status === 'DRAFT' && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={handlePost} loading={posting}>过账</Button>
          )}
          {order.status === 'POSTED' && (
            <Button type="primary" icon={<EnvironmentOutlined />} onClick={openLocationModal}>放置货位</Button>
          )}
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="单号"><Text copyable code>{order.orderNo}</Text></Descriptions.Item>
          <Descriptions.Item label="类型">{order.type || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color={statusMap[order.status]?.color}>{statusMap[order.status]?.label || order.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="仓库">{order.warehouse?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="供应商">{order.supplier?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="总数量">{order.totalQty ? Number(order.totalQty) : '-'}</Descriptions.Item>
          <Descriptions.Item label="总金额">{order.totalAmount ? `¥${Number(order.totalAmount).toFixed(2)}` : '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="过账时间">{order.postedAt ? new Date(order.postedAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="入库明细">
        <Table columns={itemColumns} dataSource={items} rowKey="id" pagination={false} size="small" scroll={{ x: 700 }} />
      </Card>

      {/* 放置货位弹窗 */}
      <Modal title="放置货位" open={locationModalOpen} onCancel={() => setLocationModalOpen(false)} width={600} footer={null}>
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>仓库：</span>
          <Select style={{ flex: 1 }} placeholder="选择仓库" allowClear
            value={locWarehouseId}
            onChange={(v) => { setLocWarehouseId(v); loadBoxes(v); }}>
            {warehouses.map((wh: any) => <Select.Option key={wh.id} value={wh.id}>{wh.name}</Select.Option>)}
          </Select>
        </div>
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>统一货位：</span>
          <Select style={{ flex: 1 }} placeholder="输入4段库位编码（如A-1-1-1）" showSearch allowClear
            optionFilterProp="children"
            showArrow={true}
            filterOption={(input, option) => {
              const label = option?.children?.toString() || '';
              return label.toLowerCase().includes(input.toLowerCase());
            }}
            onChange={(v) => locationForm.setFieldsValue({ commonBox: v })}>
            {boxes.map((box: any) => <Select.Option key={box.id} value={box.id}>{box.code}</Select.Option>)}
          </Select>
          <Button onClick={handleSameBox}>同货位</Button>
        </div>
        <Form form={locationForm} layout="vertical">
          <Form.List name="items">
            {(fields) => fields.map((field) => (
              <div key={field.key} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{locationForm.getFieldValue(['items', field.name, 'productName'])}</span>
                <span>×</span>
                <span>{locationForm.getFieldValue(['items', field.name, 'quantity'])}</span>
                <Form.Item name={[field.name, 'boxId']} noStyle>
                  <Select style={{ width: 200 }} placeholder="输入4段库位" showSearch allowClear
                    optionFilterProp="children"
                    showArrow={true}
                    filterOption={(input, option) => {
                      const label = option?.children?.toString() || '';
                      return label.toLowerCase().includes(input.toLowerCase());
                    }}
                    onChange={(v) => {
                      const box = boxes.find((b: any) => b.id === v);
                      if (box) {
                        const items = locationForm.getFieldValue('items') || [];
                        items[field.name].locationId = box.locationId;
                        items[field.name].boxId = v;
                        locationForm.setFieldsValue({ items });
                      }
                    }}>
                    {boxes.map((box: any) => <Select.Option key={box.id} value={box.id}>{box.code}</Select.Option>)}
                  </Select>
                </Form.Item>
                <Form.Item name={[field.name, 'locationId']} noStyle hidden />
                <Form.Item name={[field.name, 'productId']} noStyle hidden />
              </div>
            ))}
          </Form.List>
          <Button type="primary" onClick={handleAssignLocations} loading={assigning} block style={{ marginTop: 16 }}>确认分配</Button>
        </Form>
      </Modal>

      {/* 价格历史弹窗 */}
      <Modal title="价格历史" open={priceHistoryOpen} onCancel={() => setPriceHistoryOpen(false)} footer={null} width={600}>
        {priceHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无价格记录</div>
        ) : (
          <Table dataSource={priceHistory} rowKey={(_, i) => String(i)} size="small" pagination={false} columns={[
            { title: '来源', dataIndex: 'source', width: 60 },
            { title: '批次号', dataIndex: 'lotNumber', width: 140 },
            { title: '单价', dataIndex: 'price', width: 100, render: (v: number) => `¥${Number(v).toFixed(2)}` },
            { title: '数量', dataIndex: 'quantity', width: 80 },
            { title: '时间', dataIndex: 'date', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
          ]} />
        )}
      </Modal>
    </div>
  );
}
