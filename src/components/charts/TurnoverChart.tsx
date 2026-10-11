'use client';

import React from 'react';
import { Card, Table, Progress, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

/** 周转率数据 */
interface TurnoverData {
  id: string;
  rank: number;
  name: string;
  sku: string;
  category: string;
  turnoverRate: number;
  avgDays: number;
  trend: 'up' | 'down' | 'stable';
}

interface TurnoverChartProps {
  data?: TurnoverData[];
}

/** 默认演示数据 */
const defaultData: TurnoverData[] = [
  { id: '1', rank: 1, name: '商品A', sku: 'SKU-001', category: '电子', turnoverRate: 12.5, avgDays: 29, trend: 'up' },
  { id: '2', rank: 2, name: '商品B', sku: 'SKU-002', category: '食品', turnoverRate: 10.2, avgDays: 36, trend: 'up' },
  { id: '3', rank: 3, name: '商品C', sku: 'SKU-003', category: '服装', turnoverRate: 8.8, avgDays: 41, trend: 'stable' },
  { id: '4', rank: 4, name: '商品D', sku: 'SKU-004', category: '日用', turnoverRate: 6.5, avgDays: 56, trend: 'down' },
  { id: '5', rank: 5, name: '商品E', sku: 'SKU-005', category: '电子', turnoverRate: 5.1, avgDays: 72, trend: 'down' },
];

/** 趋势图标 */
const trendIcons: Record<string, { icon: string; color: string }> = {
  up: { icon: '↑', color: '#2E7D32' },
  down: { icon: '↓', color: '#D32F2F' },
  stable: { icon: '→', color: '#6B7280' },
};

/** 周转率排行组件 */
const TurnoverChart: React.FC<TurnoverChartProps> = ({ data = defaultData }) => {
  const columns: ColumnsType<TurnoverData> = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 60,
      render: (rank: number) => (
        <span
          style={{
            display: 'inline-block',
            width: 24,
            height: 24,
            lineHeight: '24px',
            textAlign: 'center',
            borderRadius: '50%',
            background: rank <= 3 ? '#FF9900' : '#F3F4F6',
            color: rank <= 3 ? '#fff' : '#6B7280',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {rank}
        </span>
      ),
    },
    {
      title: '商品',
      key: 'product',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{record.name}</div>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>{record.sku}</div>
        </div>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 70,
      render: (text: string) => <Tag>{text}</Tag>,
    },
    {
      title: '周转率',
      dataIndex: 'turnoverRate',
      key: 'turnoverRate',
      width: 100,
      render: (rate: number) => (
        <span style={{ fontWeight: 600, color: '#232F3E' }}>{rate}</span>
      ),
    },
    {
      title: '周转天数',
      dataIndex: 'avgDays',
      key: 'avgDays',
      width: 80,
      render: (days: number) => `${days}天`,
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      width: 60,
      render: (trend: string) => {
        const config = trendIcons[trend];
        return (
          <span style={{ color: config.color, fontWeight: 600, fontSize: 16 }}>
            {config.icon}
          </span>
        );
      },
    },
  ];

  return (
    <Card
      title="周转率排行 Top 10"
      style={{ borderRadius: 8 }}
    >
      <Table<TurnoverData>
        columns={columns}
        dataSource={data}
        rowKey="id"
        pagination={false}
        size="small"
      />
    </Card>
  );
};

export default TurnoverChart;
