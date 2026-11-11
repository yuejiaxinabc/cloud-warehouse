'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tag, Typography, Button, Space, message, Spin, Modal } from 'antd';
import AttachmentPanel from '@/components/ui/AttachmentPanel';
import { PrinterOutlined, ArrowLeftOutlined, SendOutlined, AuditOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';

const { Title, Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  // v1.2.1：审批链上的 LOCKED / APPROVED 之前没有文案，状态列直接显示英文码
  LOCKED: { label: '已锁定', color: 'processing' },
  APPROVED: { label: '已审批', color: 'blue' },
  POSTED: { label: '已过账', color: 'green' },
  CANCELLED: { label: '已取消', color: 'red' },
};

export default function StockOutDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // v1.2.1：审批链按钮共用一个 loading，避免连点重复提交
  const [actionLoading, setActionLoading] = useState(false);

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

  /**
   * v1.2.1：出库单推进动作统一入口（提交审批 / 审批 / 驳回取消 / 过账）
   * 之前详情页没有任何推进按钮，单子 submit 后卡在 LOCKED，只能手改库。
   */
  const runAction = async (
    url: string,
    confirmMsg: string,
    successMsg: string,
    body?: any,
  ) => {
    const confirmed = await new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: '确认操作',
        content: confirmMsg,
        okText: '确认',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      // 不传 body 时不要带 Content-Type，否则后端 json() 解析空串会报错
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        message.success(successMsg);
        fetchOrder(); // 成功后刷新详情，按钮随状态切换
      } else {
        message.error(data?.error || `操作失败（HTTP ${res.status}）`);
      }
    } catch (e) {
      message.error('网络错误，请稍后重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = () =>
    runAction(
      `/api/stock-out/${id}/submit`,
      '提交后将锁定库存等待审批，确认提交？',
      '已提交审批',
    );

  const handleApprove = () =>
    runAction(
      `/api/stock-out/${id}/approve`,
      '审批通过后单据进入「已审批」，可继续过账。确认通过？',
      '审批通过',
      { approved: true },
    );

  const handleRejectCancel = () =>
    runAction(
      `/api/stock-out/${id}/cancel`,
      '驳回并取消将释放该单已锁定的库存，取消后不可恢复，确认？',
      '出库单已取消',
    );

  const handlePost = () =>
    runAction(
      `/api/stock-out/${id}/post`,
      '过账后将按批次扣减库存且不可撤销，确认过账？',
      '出库单已过账，库存已更新',
    );

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

  // v1.2.1：按状态给出可推进动作，POSTED / CANCELLED 为终态，只读
  const status: string = order.status;
  const canSubmit = status === 'DRAFT';
  const canPost = status === 'DRAFT' || status === 'APPROVED';
  const canApprove = status === 'LOCKED';
  const readOnly = status === 'POSTED' || status === 'CANCELLED';

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
        <Space>
          {readOnly && <Text type="secondary">该单已结束，只读</Text>}
          {canSubmit && (
            <Button type="primary" icon={<SendOutlined />} loading={actionLoading} onClick={handleSubmit}>
              提交审批
            </Button>
          )}
          {canApprove && (
            <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading} onClick={handleApprove}>
              审批通过
            </Button>
          )}
          {canApprove && (
            <Button danger icon={<CloseCircleOutlined />} loading={actionLoading} onClick={handleRejectCancel}>
              驳回并取消
            </Button>
          )}
          {canPost && (
            <Button type="primary" ghost icon={<AuditOutlined />} loading={actionLoading} onClick={handlePost}>
              过账
            </Button>
          )}
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button>
        </Space>
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
