'use client';

import React, { useState } from 'react';
import { Card, Button, Typography, Space, message, Row, Col, Divider, Alert } from 'antd';
import { DownloadOutlined, FileExcelOutlined, ShopOutlined, InboxOutlined, ExportOutlined, ImportOutlined, SwapOutlined, AuditOutlined, EnvironmentOutlined, DatabaseOutlined, TransactionOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const modules = [
  { label: "商品列表", type: "PRODUCT", icon: <ShopOutlined />, desc: "编码、名称、规格、品牌、分类、成本、售价等" },
  { label: "库存明细", type: "INVENTORY", icon: <InboxOutlined />, desc: "商品、仓库、货位、在手量、成本、金额" },
  { label: "入库记录", type: "INBOUND", icon: <ImportOutlined />, desc: "入库单号、类型、供应商、数量、金额" },
  { label: "出库记录", type: "OUTBOUND", icon: <ExportOutlined />, desc: "出库单号、类型、客户、领用人、部门" },
  { label: "调拨记录", type: "TRANSFER", icon: <SwapOutlined />, desc: "调拨单号、源仓库、目标仓库、商品项数" },
  { label: "盘点记录", type: "STOCKTAKE", icon: <AuditOutlined />, desc: "盘点单号、仓库、类型、商品项数" },
  { label: "货位列表", type: "LOCATION", icon: <EnvironmentOutlined />, desc: "货位编码、区域、类型、容量、状态" },
  { label: "仓库列表", type: "WAREHOUSE", icon: <DatabaseOutlined />, desc: "仓库编码、名称、地址、联系人" },
  { label: "库存流水", type: "TRANSACTION", icon: <TransactionOutlined />, desc: "类型、单号、商品、数量、变动明细" },
];

export default function ExportPage() {
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const handleExport = async (type: string, label: string) => {
    setLoading(prev => ({ ...prev, [type]: true }));
    try {
      const res = await fetch(`/api/export?type=${type}`);
      const json = await res.json();
      
      if ((json.success || json.code === 0) && json.data) {
        const { headers, rows, fileName } = json.data;
        
        if (!rows || rows.length === 0) {
          message.warning(`${label} 暂无数据`);
          return;
        }
        
        // 生成CSV内容
        const csvContent = [
          headers.join(','),
          ...rows.map((row: any[]) => row.map((cell: any) => {
            const str = String(cell ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(','))
        ].join('\n');
        
        // 添加BOM头以支持中文
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // 下载文件
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        message.success(`${label} 导出成功（${rows.length} 条）`);
      } else {
        message.error(json.message || json.error || '导出失败');
      }
    } catch (e) {
      console.error(e);
      message.error('导出失败');
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  return (
    <div className="page-container">
      <h4 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>数据导出</h4>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>导出 CSV 文件，可用 Excel 直接打开，支持中文</Text>
      
      <Row gutter={[16, 16]}>
        {modules.map(mod => (
          <Col xs={24} sm={12} md={8} lg={6} key={mod.type}>
            <Card 
              hoverable
              style={{ height: '100%' }}
              onClick={() => handleExport(mod.type, mod.label)}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, color: '#52c41a', marginBottom: 12 }}>{mod.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{mod.label}</div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>{mod.desc}</div>
                <Button 
                  type="primary" 
                  icon={<DownloadOutlined />} 
                  loading={loading[mod.type]}
                  block
                >
                  导出 CSV
                </Button>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Alert
        style={{ marginTop: 24 }}
        type="info"
        showIcon
        message="导出说明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>库存流水默认导出最近 10000 条记录</li>
            <li>导出文件为 CSV 格式，带 BOM 头，Excel 打开不会乱码</li>
            <li>如需筛选条件，请在对应管理页面使用导出功能</li>
          </ul>
        }
      />
    </div>
  );
}
