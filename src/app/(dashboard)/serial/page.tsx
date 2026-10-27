'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Input, Tag, Typography, Descriptions, Modal, Timeline, message } from 'antd';
import { SearchOutlined, QrcodeOutlined, HistoryOutlined, ArrowLeftOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const txnTypeMap: Record<string, { label: string; color: string }> = {
  INBOUND: { label: '入库', color: 'green' },
  OUTBOUND: { label: '出库', color: 'blue' },
  TRANSFER: { label: '调拨', color: 'orange' },
  COUNT: { label: '盘点', color: 'purple' },
  ADJUST: { label: '调整', color: 'red' },
};

const serialStatusMap: Record<string, { label: string; color: string }> = {
  in_stock: { label: '在库', color: 'green' },
  sold: { label: '已售', color: 'blue' },
  returned: { label: '已退', color: 'orange' },
  scrapped: { label: '已废', color: 'red' },
  IN_STOCK: { label: '在库', color: 'green' },
  SOLD: { label: '已售', color: 'blue' },
  RETURNED: { label: '已退', color: 'orange' },
  SCRAPPED: { label: '已废', color: 'red' },
};

export default function SerialPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // FIX-2026-1015：进页面就加载全量商品追踪，不再强制先输关键词，
  // 避免「有商品但页面空的」错觉。搜索框只做过滤。
  useEffect(() => {
    fetchData('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = async (search = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('keyword', search);
      const res = await fetch(`/api/serial?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data?.list || []);
        if (search.trim() && (json.data?.list || []).length === 0) {
          message.info('未找到相关记录');
        }
      }
    } catch (e) {
      console.error(e);
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '商品编码', dataIndex: 'productCode', key: 'productCode', width: isMobile ? 100 : 120, render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: isMobile ? 12 : 14 }}>{t}</span> },
    { title: '商品名称', dataIndex: 'productName', key: 'productName', width: isMobile ? 120 : 180, ellipsis: true },
    { title: '序列号数量', key: 'serialCount', width: isMobile ? 80 : 100, render: (_: any, r: any) => <Tag color="blue">{r.serials?.length || 0}</Tag> },
    {
      title: '批次号', key: 'lots', width: isMobile ? 120 : 180,
      render: (_: any, r: any) => {
        const lots: string[] = r.lots || [];
        if (!lots.length) return <Text type="secondary">-</Text>;
        return (
          <Space size={2} wrap>
            {lots.slice(0, 2).map(l => <Tag key={l} color="geekblue">{l}</Tag>)}
            {lots.length > 2 && <Tag>+{lots.length - 2}</Tag>}
          </Space>
        );
      },
    },
    ...(!isMobile ? [
      { title: '变动记录', key: 'txnCount', width: 100, render: (_: any, r: any) => <Tag color="green">{r.transactions?.length || 0}</Tag> },
      { title: '最新变动', key: 'lastTxn', width: 180, render: (_: any, r: any) => {
        const last = r.transactions?.[0];
        if (!last) return '-';
        const typeInfo = txnTypeMap[last.txnType] || { label: last.txnType, color: 'default' };
        return <><Tag color={typeInfo.color}>{typeInfo.label}</Tag> {last.txnTime ? new Date(last.txnTime).toLocaleDateString('zh-CN') : ''}</>;
      }},
    ] : []),
    { 
      title: '操作', key: 'action', width: isMobile ? 70 : 100, 
      render: (_: any, r: any) => (
        <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => { setSelected(r); setDetailOpen(true); }}>
          {isMobile ? '' : '查看详情'}
        </Button>
      ), 
    },
  ];

  return (
    <div style={{ padding: isMobile ? 0 : 0 }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        marginBottom: isMobile ? 12 : 16,
        gap: isMobile ? 8 : 0
      }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>序列号追踪</h4>
      </div>

      <Card style={{ marginBottom: isMobile ? 12 : 16 }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 8 : 16,
          marginBottom: isMobile ? 12 : 16 
        }}>
          <Input 
            prefix={<SearchOutlined />}
            placeholder={isMobile ? "输入序列号/编码/名称" : "输入序列号/商品编码/商品名称/入库单号"} 
            value={keyword} 
            onChange={e => setKeyword(e.target.value)} 
            onPressEnter={() => fetchData(keyword)}
            style={{ width: isMobile ? '100%' : 400 }} 
            allowClear 
          />
          <Button type="primary" icon={<QrcodeOutlined />} onClick={() => fetchData(keyword)} loading={loading} block={isMobile}>扫码查询</Button>
        </div>

        <Table 
          columns={columns} 
          dataSource={data} 
          loading={loading} 
          rowKey="productId" 
          scroll={{ x: isMobile ? 400 : 800 }} 
          pagination={{ pageSize: 10, size: isMobile ? 'small' : 'default' }} 
          size={isMobile ? 'small' : 'small'} 
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal 
        title="商品变动详情" 
        open={detailOpen} 
        onCancel={() => { setDetailOpen(false); setSelected(null); }} 
        footer={null} 
        width={isMobile ? '95%' : 800}
      >
        {selected && (
          <>
            <Descriptions 
              column={isMobile ? 1 : 2} 
              bordered 
              size="small" 
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="商品编码">{selected.productCode}</Descriptions.Item>
              <Descriptions.Item label="商品名称">{selected.productName}</Descriptions.Item>
              <Descriptions.Item label="序列号数量">{selected.serials?.length || 0}</Descriptions.Item>
              <Descriptions.Item label="变动记录数">{selected.transactions?.length || 0}</Descriptions.Item>
            </Descriptions>

            {selected.serials && selected.serials.length > 0 && (
              <>
                <Title level={5}>序列号列表</Title>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="serialNo"
                  dataSource={selected.serials}
                  scroll={{ x: isMobile ? 400 : 600 }}
                  columns={[
                    { title: '序列号', dataIndex: 'serialNo', width: isMobile ? 140 : 200, render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: isMobile ? 11 : 14 }}>{t}</span> },
                    ...(!isMobile ? [
                      { title: '批次号', dataIndex: 'lotNumber', width: 150, render: (t: string) => t || '-' },
                    ] : []),
                    { title: '状态', dataIndex: 'status', width: 80, render: (s: string) => {
                      const info = serialStatusMap[s] || { label: s, color: 'default' };
                      return <Tag color={info.color}>{info.label}</Tag>;
                    }},
                    ...(!isMobile ? [
                      { title: '创建时间', dataIndex: 'createdAt', width: 120, render: (t: string) => t ? new Date(t).toLocaleDateString('zh-CN') : '-' },
                    ] : []),
                  ]}
                  style={{ marginBottom: 16 }}
                />
              </>
            )}

            <Title level={5}>变动记录</Title>
            <Table
              size="small"
              pagination={{ pageSize: 10, size: 'small' }}
              rowKey="id"
              dataSource={selected.transactions}
              scroll={{ x: isMobile ? 500 : 1000 }}
              columns={[
                { title: '时间', dataIndex: 'txnTime', width: isMobile ? 120 : 160, render: (t: string) => t ? new Date(t).toLocaleString('zh-CN') : '-' },
                { title: '类型', dataIndex: 'txnType', width: 70, render: (t: string) => {
                  const info = txnTypeMap[t] || { label: t, color: 'default' };
                  return <Tag color={info.color}>{info.label}</Tag>;
                }},
                { title: '单号', dataIndex: 'refNo', width: isMobile ? 100 : 150, render: (t: string) => <span style={{ fontFamily: 'monospace', fontSize: isMobile ? 11 : 14 }}>{t}</span> },
                ...(!isMobile ? [
                  { title: '批次号', dataIndex: 'lotNumber', width: 120, render: (t: string) => t || '-' },
                ] : []),
                { title: '数量', dataIndex: 'quantity', width: 70, render: (v: number) => <span style={{ color: v > 0 ? '#52c41a' : '#f5222d' }}>{v > 0 ? '+' : ''}{v}</span> },
                ...(!isMobile ? [
                  { title: '单价', dataIndex: 'costPrice', width: 100, render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '-' },
                  { title: '总价', dataIndex: 'amount', width: 120, render: (v: number) => v ? <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{Number(v).toFixed(2)}</span> : '-' },
                  { title: '变动前', dataIndex: 'beforeQty', width: 80 },
                  { title: '变动后', dataIndex: 'afterQty', width: 80 },
                ] : []),
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
