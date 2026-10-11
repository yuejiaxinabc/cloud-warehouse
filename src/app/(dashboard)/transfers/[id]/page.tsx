'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Descriptions, Table, Tag, Typography, Button, Space, message, Spin, Modal, Select, Timeline } from 'antd';
import {
  PrinterOutlined, ArrowLeftOutlined, SendOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DeleteOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';

const { Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  SENT: { label: '已发出', color: 'blue' },
  RECEIVED: { label: '已接收', color: 'green' },
  CANCELLED: { label: '已取消', color: 'red' },
};

export default function TransferDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const [receiveLocations, setReceiveLocations] = useState<any[]>([]);

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/transfers/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setOrder(data.data);
      } else if (res.status === 401 || data.code === 401) {
        message.error('请先登录');
        router.push('/login');
      } else {
        message.error(data.error || '加载失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  // ==================== 操作 ====================

  const handleAction = async (action: string, url: string, confirmMsg: string, successMsg: string, method = 'POST') => {
    if (confirmMsg) {
      const confirmed = await new Promise<boolean>(resolve => {
        Modal.confirm({
          title: '确认操作',
          icon: <ExclamationCircleOutlined />,
          content: confirmMsg,
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.success) {
        message.success(successMsg);
        fetchOrder();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = () => handleAction(
    'send', `/api/transfers/${id}/send`,
    '发出后将从源仓库扣减库存，确定要发出吗？',
    '调拨单已发出'
  );

  const handleCancel = () => handleAction(
    'cancel', `/api/transfers/${id}/cancel`,
    '确定要取消此调拨单吗？取消后不可恢复。',
    '调拨单已取消'
  );

  const handleDelete = () => handleAction(
    'delete', `/api/transfers/${id}`,
    '确定要删除此调拨单吗？删除后不可恢复。',
    '调拨单已删除',
    'DELETE'
  );

  // ==================== 接收弹窗 ====================

  const loadBoxes = async (warehouseId: number) => {
    setBoxesLoading(true);
    try {
      const res = await fetch(`/api/warehouse/structure?warehouseId=${warehouseId}`, { cache: 'no-store' });
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
    } catch {} finally { setBoxesLoading(false); }
  };;

  const openReceiveModal = () => {
    if (!order) return;
    loadBoxes(Number(order.toWhId));
    const items = (order.transferItems || []).map((item: any) => ({
      productId: Number(item.productId),
      productName: item.product?.name || '-',
      quantity: Number(item.sentQty || item.quantity),
      boxId: undefined,
      locationId: undefined,
    }));
    setReceiveLocations(items);
    setReceiveModalOpen(true);
  };

  const handleReceiveConfirm = async () => {
    setActionLoading(true);
    try {
      const locs = receiveLocations.filter(l => l.locationId).map(l => ({
        productId: l.productId,
        locationId: l.locationId,
        boxId: l.boxId,
        quantity: l.quantity,
      }));
      const res = await fetch(`/api/transfers/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: locs }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('调拨单已接收');
        setReceiveModalOpen(false);
        fetchOrder();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setActionLoading(false);
    }
  };

  // ==================== 打印 ====================

  const handlePrint = () => {
    if (!order) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const items = order.transferItems || [];
    const html = `<!DOCTYPE html><html><head><title>调拨单 - ${order.orderNo}</title>
<style>
  body{font-family:'SimSun',serif;padding:20px}
  h1{text-align:center;font-size:24px}
  .info{margin:20px 0;display:flex;flex-wrap:wrap;gap:8px 30px}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th,td{border:1px solid #000;padding:8px;text-align:left}
  th{background:#f0f0f0}
  .footer{margin-top:40px;display:flex;justify-content:space-between}
  .footer div{width:25%;text-align:center}
  @media print{body{padding:0}}
</style></head><body>
<h1>调拨单</h1>
<div class="info">
  <span>单号: ${order.orderNo}</span>
  <span>源仓库: ${order.fromWarehouse?.name || '-'}</span>
  <span>目的仓库: ${order.toWarehouse?.name || '-'}</span>
  <span>状态: ${statusMap[order.status]?.label || order.status}</span>
  <span>创建时间: ${order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</span>
  ${order.remark ? `<span>备注: ${order.remark}</span>` : ''}
</div>
<table>
<thead><tr><th>序号</th><th>商品编码</th><th>商品名称</th><th>单位</th><th>计划数量</th><th>发出数量</th><th>接收数量</th><th>备注</th></tr></thead>
<tbody>${items.map((item: any, i: number) => `<tr>
  <td>${i+1}</td><td>${item.product?.code||'-'}</td><td>${item.product?.name||'-'}</td>
  <td>${item.product?.unit||'-'}</td><td>${Number(item.quantity||0)}</td>
  <td>${item.sentQty?Number(item.sentQty):'-'}</td><td>${item.receivedQty?Number(item.receivedQty):'-'}</td>
  <td>${item.remark||'-'}</td></tr>`).join('')}</tbody>
</table>
<div class="footer"><div>制单人: ___________</div><div>发货人: ___________</div><div>收货人: ___________</div><div>审核人: ___________</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ==================== 渲染 ====================

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!order) {
    return (
      <div style={{ textAlign: 'center', padding: 100 }}>
        <Text type="secondary">调拨单不存在或已删除</Text>
        <br /><br />
        <Button onClick={() => router.push('/transfers')}>返回列表</Button>
      </div>
    );
  }

  const items = order.transferItems || [];
  const canCancel = order.status === 'DRAFT';
  const canDelete = ['DRAFT', 'CANCELLED'].includes(order.status);
  const canSend = order.status === 'DRAFT';
  const canReceive = order.status === 'SENT';

  const itemColumns = [
    { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    { title: '商品编码', width: 120, render: (_: any, r: any) => r.product?.code || '-' },
    { title: '商品名称', width: 200, render: (_: any, r: any) => r.product?.name || '-' },
    { title: '单位', width: 80, render: (_: any, r: any) => r.product?.unit || '-' },
    { title: '计划数量', dataIndex: 'quantity', width: 100, render: (v: any) => Number(v || 0) },
    { title: '发出数量', dataIndex: 'sentQty', width: 100, render: (v: any) => v != null ? Number(v) : '-' },
    { title: '接收数量', dataIndex: 'receivedQty', width: 100, render: (v: any) => v != null ? Number(v) : '-' },
    { title: '备注', dataIndex: 'remark', width: 150, render: (v: any) => v || '-' },
  ];

  return (
    <div className="page-container">
      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/transfers')}>返回</Button>
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>调拨单详情</h4>
        </Space>
        <Space>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button>
          {canSend && (
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={actionLoading}>
              发出
            </Button>
          )}
          {canReceive && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={openReceiveModal} loading={actionLoading}>
              接收
            </Button>
          )}
          {canCancel && (
            <Button danger icon={<CloseCircleOutlined />} onClick={handleCancel} loading={actionLoading}>
              取消
            </Button>
          )}
          {canDelete && (
            <Button danger icon={<DeleteOutlined />} onClick={handleDelete} loading={actionLoading}>
              删除
            </Button>
          )}
        </Space>
      </div>

      {/* 基本信息 */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="单号"><Text copyable code>{order.orderNo}</Text></Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusMap[order.status]?.color}>{statusMap[order.status]?.label || order.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="源仓库">{order.fromWarehouse?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="目的仓库">{order.toWarehouse?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="发出时间">{order.sentAt ? new Date(order.sentAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="接收时间">{order.receivedAt ? new Date(order.receivedAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{order.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 调拨明细 */}
      <Card title={`调拨明细 (${items.length}项)`}>
        <Table columns={itemColumns} dataSource={items} rowKey="id" pagination={false} size="small" scroll={{ x: 900 }} />
      </Card>

      {/* 接收货位弹窗 */}
      <Modal
        title="接收 - 选择货位"
        open={receiveModalOpen}
        onCancel={() => setReceiveModalOpen(false)}
        width={600}
        footer={null}
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          为每个商品选择放置的货位（可选，不选则放入默认位置）
        </div>
        {receiveLocations.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flex: 1, fontWeight: 500 }}>{item.productName} × {item.quantity}</span>
            <Select
              style={{ width: 200 }}
              placeholder="选择货位"
              showSearch
              allowClear
              loading={boxesLoading}
              optionFilterProp="children"
              filterOption={(input, option) =>
                ((option?.children as string) || '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(v) => {
                const box = boxes.find((b: any) => b.id === v);
                const updated = [...receiveLocations];
                updated[idx].boxId = v;
                updated[idx].locationId = box?.locationId;
                setReceiveLocations(updated);
              }}
            >
              {boxes.map((box: any) => (
                <Select.Option key={box.id} value={box.id}>{box.code}</Select.Option>
              ))}
            </Select>
          </div>
        ))}
        <Button
          type="primary"
          onClick={handleReceiveConfirm}
          loading={actionLoading}
          block
          style={{ marginTop: 16 }}
        >
          确认接收
        </Button>
      </Modal>
    </div>
  );
}
