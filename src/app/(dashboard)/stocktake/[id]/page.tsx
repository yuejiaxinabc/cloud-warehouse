'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, Descriptions, Table, Tag, Typography, Button, Space, message, Spin, InputNumber } from 'antd';
import { PrinterOutlined, ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useRouter, useParams } from 'next/navigation';

const { Title, Text } = Typography;

const statusMap: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  COUNTING: { label: '盘点中', color: 'blue' },
  ADJUSTED: { label: '已调整', color: 'green' },
  CANCELLED: { label: '已取消', color: 'red' },
};

export default function StocktakeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) fetchOrder();
  }, [id]);

  const fetchOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stocktake?id=' + id);
      const data = await res.json();
      if (data.success && data.data?.items?.length > 0) {
        const orderData = data.data.items[0];
        setOrder(orderData);
        // Initialize edit items
        const items = (orderData.countItems || []).map((item: any) => ({
          ...item,
          editCountQty: item.countQty !== null && item.countQty !== undefined ? Number(item.countQty) : undefined,
          editRemark: item.remark || '',
        }));
        setEditItems(items);
      } else {
        message.error('盘点单不存在');
      }
    } catch (e) {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (itemId: number, value: number | null) => {
    setEditItems(prev => prev.map(item => {
      if (Number(item.id) === itemId) {
        const systemQty = Number(item.systemQty || 0);
        const countQty = value || 0;
        return { ...item, editCountQty: value, diffQty: countQty - systemQty };
      }
      return item;
    }));
  };

  const handleRemarkChange = (itemId: number, value: string) => {
    setEditItems(prev => prev.map(item => {
      if (Number(item.id) === itemId) {
        return { ...item, editRemark: value };
      }
      return item;
    }));
  };

  const handleStart = async () => {
    try {
      const res = await fetch('/api/stocktake/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('盘点已开始');
        fetchOrder();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (e) { message.error('操作失败'); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const itemsToSave = editItems
        .filter(item => item.editCountQty !== undefined && item.editCountQty !== null)
        .map(item => ({
          id: Number(item.id),
          countQty: Number(item.editCountQty),
          remark: item.editRemark || '',
        }));

      if (itemsToSave.length === 0) {
        message.warning('请至少填写一个实盘数量');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/stocktake/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToSave }),
      });
      const data = await res.json();
      if (data.success) {
        message.success('保存成功');
        fetchOrder();
      } else {
        message.error(data.error || '保存失败');
      }
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = async () => {
    // 检查是否已保存实盘数据
    const hasCountData = editItems.some(item => item.editCountQty !== undefined && item.editCountQty !== null);
    if (!hasCountData) {
      message.warning('请先保存实盘数据再结算');
      return;
    }
    try {
      const res = await fetch('/api/stocktake/' + id + '/settle', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        message.success('盘点结算完成，库存已调整');
        fetchOrder();
      } else {
        message.error(data.error || '结算失败');
      }
    } catch (e) { message.error('结算失败'); }
  };

  const handlePrint = (type: 'full' | 'partial') => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !order) return;

    const items = editItems.length > 0 ? editItems : (order.countItems || []);
    
    const html = '<!DOCTYPE html><html><head><title>盘点单 - ' + order.orderNo + '</title>' +
      '<style>' +
      'body { font-family: SimSun, serif; padding: 20px; }' +
      'h1 { text-align: center; font-size: 24px; }' +
      '.info { margin: 20px 0; }' +
      '.info span { margin-right: 30px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 20px; }' +
      'th, td { border: 1px solid #000; padding: 8px; text-align: left; }' +
      'th { background: #f0f0f0; }' +
      '.empty-cell { height: 30px; }' +
      '.footer { margin-top: 40px; display: flex; justify-content: space-between; }' +
      '.footer div { width: 30%; text-align: center; }' +
      '@media print { body { padding: 0; } }' +
      '</style></head><body>' +
      '<h1>' + (type === 'full' ? '全盘盘点单' : '抽盘盘点单') + '</h1>' +
      '<div class="info">' +
      '<span>单号: ' + order.orderNo + '</span>' +
      '<span>仓库: ' + (order.warehouse?.name || '-') + '</span>' +
      '<span>类型: ' + (order.type || '-') + '</span>' +
      '<span>状态: ' + (statusMap[order.status]?.label || '-') + '</span>' +
      '<span>打印时间: ' + new Date().toLocaleString('zh-CN') + '</span>' +
      '</div>' +
      '<table><thead><tr>' +
      '<th>序号</th><th>商品编码</th><th>商品名称</th><th>系统数量</th><th>实际数量</th><th>差异</th><th>备注</th>' +
      '</tr></thead><tbody>';

    let rows = '';
    items.forEach((item: any, i: number) => {
      const systemQty = Number(item.systemQty || 0);
      const countQty = item.editCountQty !== undefined ? Number(item.editCountQty) : Number(item.countQty || 0);
      const diff = countQty - systemQty;
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + (item.product?.code || '-') + '</td>' +
        '<td>' + (item.product?.name || '-') + '</td>' +
        '<td>' + systemQty + '</td>' +
        '<td>' + (countQty || '') + '</td>' +
        '<td style="color:' + (diff !== 0 ? 'red' : 'green') + '">' + diff + '</td>' +
        '<td>' + (item.editRemark || item.remark || '') + '</td>' +
        '</tr>';
    });

    const footer = '</tbody></table>' +
      '<div class="footer">' +
      '<div>盘点人: ___________</div>' +
      '<div>复核人: ___________</div>' +
      '<div>日期: ___________</div>' +
      '</div>' +
      '<script>window.onload = function() { window.print(); }<\/script>' +
      '</body></html>';

    printWindow.document.write(html + rows + footer);
    printWindow.document.close();
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!order) {
    return <div style={{ textAlign: 'center', padding: 100 }}>盘点单不存在</div>;
  }

  const itemColumns = [
    { title: '序号', width: 60, render: (_: any, __: any, i: number) => i + 1 },
    { title: '商品编码', width: 120, render: (_: any, r: any) => r.product?.code || '-' },
    { title: '商品名称', width: 200, render: (_: any, r: any) => r.product?.name || '-' },
    { title: '系统数量', dataIndex: 'systemQty', width: 100, render: (v: any) => Number(v || 0) },
    { 
      title: '实盘数量', width: 120, 
      render: (_: any, r: any) => (
        <InputNumber
          min={0}
          value={r.editCountQty}
          onChange={(v) => handleQtyChange(Number(r.id), v)}
          style={{ width: '100%' }}
          placeholder="填写数量"
        />
      )
    },
    { 
      title: '差异', width: 100, 
      render: (_: any, r: any) => {
        const systemQty = Number(r.systemQty || 0);
        const countQty = r.editCountQty !== undefined ? Number(r.editCountQty) : 0;
        const diff = countQty - systemQty;
        return <span style={{ color: diff !== 0 ? '#D32F2F' : '#2E7D32', fontWeight: 600 }}>{diff}</span>;
      }
    },
    { 
      title: '备注', width: 150,
      render: (_: any, r: any) => (
        <input
          value={r.editRemark}
          onChange={(e) => handleRemarkChange(Number(r.id), e.target.value)}
          style={{ width: '100%', border: '1px solid #d9d9d9', borderRadius: 4, padding: '4px 8px' }}
          placeholder="备注"
        />
      )
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/stocktake')}>返回</Button>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>盘点单详情</h4>
        </Space>
        <Space>
          {order.status === 'DRAFT' && (
            <Button type="primary" onClick={handleStart}>开始盘点</Button>
          )}
          {order.status === 'COUNTING' && (
            <>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存实盘数据</Button>
              <Button type="primary" danger onClick={handleSettle}>结算调整</Button>
            </>
          )}
          <Button icon={<PrinterOutlined />} onClick={() => handlePrint('full')}>全盘打印</Button>
          <Button icon={<PrinterOutlined />} onClick={() => handlePrint('partial')}>抽盘打印</Button>
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
          <Descriptions.Item label="创建时间">{order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{order.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={'盘点明细（' + editItems.length + ' 个商品）'}>
        <Table 
          columns={itemColumns} 
          dataSource={editItems} 
          rowKey="id" 
          pagination={false} 
          size="small" 
          scroll={{ x: 900 }} 
          summary={() => editItems.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}><Text strong>合计</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={3}>
                  <Text strong>{editItems.reduce((sum: number, item: any) => sum + Number(item.systemQty || 0), 0)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4}>
                  <Text strong>{editItems.reduce((sum: number, item: any) => sum + (item.editCountQty !== undefined ? Number(item.editCountQty) : 0), 0)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={5}>
                  <Text strong type={editItems.some((item: any) => {
                    const diff = (item.editCountQty !== undefined ? Number(item.editCountQty) : 0) - Number(item.systemQty || 0);
                    return diff !== 0;
                  }) ? 'danger' : 'success'}>
                    {editItems.reduce((sum: number, item: any) => {
                      const diff = (item.editCountQty !== undefined ? Number(item.editCountQty) : 0) - Number(item.systemQty || 0);
                      return sum + diff;
                    }, 0)}
                  </Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6}></Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          ) : null}
        />
      </Card>
    </div>
  );
}
