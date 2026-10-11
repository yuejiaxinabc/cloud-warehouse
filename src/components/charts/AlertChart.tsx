'use client';

import React from 'react';
import { Card, List, Tag, Progress, Space } from 'antd';
import { AlertOutlined } from '@ant-design/icons';

/** 预警数据 */
interface AlertItem {
  id: string;
  name: string;
  level: 'high' | 'medium' | 'low';
  type: string;
  value: number;
  threshold: number;
}

interface AlertChartProps {
  data?: AlertItem[];
}

/** 默认演示数据 */
const defaultData: AlertItem[] = [
  { id: '1', name: '商品A (SKU-001)', level: 'high', type: '库存不足', value: 50, threshold: 200 },
  { id: '2', name: '商品B (SKU-002)', level: 'high', type: '库存不足', value: 80, threshold: 150 },
  { id: '3', name: '商品C (SKU-003)', level: 'medium', type: '临期预警', value: 15, threshold: 30 },
  { id: '4', name: '商品D (SKU-004)', level: 'medium', type: '周转率低', value: 2, threshold: 5 },
  { id: '5', name: '商品E (SKU-005)', level: 'low', type: '库龄过长', value: 90, threshold: 60 },
];

/** 预警级别颜色 */
const levelColors: Record<string, { color: string; bg: string }> = {
  high: { color: '#D32F2F', bg: '#FFEBEE' },
  medium: { color: '#ED6C02', bg: '#FFF3E0' },
  low: { color: '#F9A825', bg: '#FFFDE7' },
};

const levelLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 预警 Top5 组件 */
const AlertChart: React.FC<AlertChartProps> = ({ data = defaultData }) => {
  return (
    <Card
      title={
        <Space>
          <AlertOutlined style={{ color: '#D32F2F' }} />
          <span>预警 Top 5</span>
        </Space>
      }
      style={{ borderRadius: 8 }}
    >
      <List
        dataSource={data}
        renderItem={(item) => {
          const levelConfig = levelColors[item.level];
          const percent = Math.round((item.value / item.threshold) * 100);

          return (
            <List.Item style={{ padding: '10px 0' }}>
              <div style={{ width: '100%' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Space size={8}>
                    <Tag
                      color={levelConfig.color}
                      style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 4px' }}
                    >
                      {levelLabels[item.level]}
                    </Tag>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</span>
                  </Space>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{item.type}</span>
                </div>
                <Progress
                  percent={percent}
                  strokeColor={levelConfig.color}
                  showInfo={false}
                  size="small"
                />
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  当前: {item.value} / 阈值: {item.threshold}
                </div>
              </div>
            </List.Item>
          );
        }}
      />
    </Card>
  );
};

export default AlertChart;
