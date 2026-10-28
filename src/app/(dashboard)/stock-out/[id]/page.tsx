'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tag, Typography, Button, Space, message, Spin } from 'antd';
import AttachmentPanel from '@/components/ui/AttachmentPanel';
import { PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';

const { Title, Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  POSTED: { label: '已过账', color: 'green' },
  CANCELLED: { label: '已取消', color: 'red' },
};

export default function StockOutDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stock-out?id=${id}`);
      const data = await res.json();
      if (data.success && data.data?.items?.length > 0) {
        setOrder(data.data.items[0]);
      } else {
        message.error('出库单不存在');
      }
    } catch (e) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    try {
      const res = await fetch('/api/stock-out/' + id + '/post', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        message.success('出库单已过账，库存已更新');
        fetchOrder();
      } else {
        message.error(data.error || '过账失败');
      }
    } catch (e) {
      message.error('过账失败');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !order) return;

    const items = order.outboundItems || order.items || [];
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>出库单 - ${order.orderNo}</title>
        <style>
          body { font-family: 'SimSun', serif; padding: 20px; }
          h1 { text-align: center; font-size: 24px; }
          .info { margin: 20px 0; }
          .info span { margin-right: 30px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #000; padding: 8px; text-align: left; }
          th { background: #f0f0f0; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; }
          .footer div { width: 30%; text-align: center; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>出库单</h1>
        <div class="info">
          <span>单号: ${order.orderNo}</span>
          <span>仓库: ${order.warehouse?.name || '-'}</span>
          <span>类型: ${order.type || '-'}</span>
          <span>状态: ${statusMap[order.status]?.label || order.status}</span>
          <span>创建时间: ${order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>序号</th>
              <th>商品编码</th>
              <th>商品名称</th>
              <th>数量</th>
              <th>单价</th>
              <th>金额</th>
              <th>批次号</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any, i: number) => `
              <tr>
                <td>${i + 1}</td>
                <td>${item.product?.code || '-'}</td>
                <td>${item.product?.name || '-'}</td>
                <td>${Number(item.quantity || 0)}</td>
                <td>${item.unitPrice ? '¥' + Number(item.unitPrice).toFixed(2) : '-'}</td>
                <td>${item.amount ? '¥' + Number(item.amount).toFixed(2) : '-'}</td>
                <td>${item.lotNumber || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          <div>制单人: ___________</div>
          <div>审核人: ___________</div>
          <div>发货人: ___________</div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!order) {
    return <div style={{ textAlign: 'center', padding: 100 }}>出库单不存在</div>;
  }

  const items = order.outboundItems || order.items || [];

  const itemColumns = [
    { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    { title: '商品编码', width: 120, render: (_: any, r: any) => r.product?.code || '-' },
    { title: '商品名称', width: 200, render: (_: any, r: any) => r.product?.name || '-' },
    { title: '数量', dataIndex: 'quantity', width: 100, render: (v: any) => Number(v || 0) },
    { title: '单价', dataIndex: 'unitPrice', width: 100, render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    { title: '金额', dataIndex: 'amount', width: 120, render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : '-' },
    { title: '批次号', dataIndex: 'lotNumber', width: 120, render: (v: any) => v || '-' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/stock-out')}>返回</Button>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>出库单详情</h4>
        </Space>
        <Button icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="单号"><Text copyable code>{order.orderNo}</Text></Descriptions.Item>
          <Descriptions.Item label="类型">{order.type || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusMap[order.status]?.color}>{statusMap[order.status]?.label || order.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="仓库">{order.warehouse?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="客户">{order.customer?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="总数量">{order.totalQty ? Number(order.totalQty) : '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="出库明细">
        <Table columns={itemColumns} dataSource={items} rowKey="id" pagination={false} size="small" scroll={{ x: 900 }} />
      </Card>

      {/* v1.3 单据附件：签收回单 */}
      <Card title="单据附件" style={{ marginTop: 16 }}>
        <AttachmentPanel module="outbound" refId={String(id)} />
      </Card>
    </div>
  );
}
