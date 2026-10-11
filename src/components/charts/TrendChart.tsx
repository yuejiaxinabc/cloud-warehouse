'use client';

import React from 'react';
import { Card, Space } from 'antd';

/** 趋势数据点 */
interface TrendDataPoint {
  date: string;
  inbound: number;
  outbound: number;
}

interface TrendChartProps {
  data?: TrendDataPoint[];
  height?: number;
}

/** 默认演示数据 */
const defaultData: TrendDataPoint[] = [
  { date: '08/01', inbound: 120, outbound: 85 },
  { date: '08/02', inbound: 95, outbound: 110 },
  { date: '08/03', inbound: 140, outbound: 92 },
  { date: '08/04', inbound: 80, outbound: 130 },
  { date: '08/05', inbound: 160, outbound: 75 },
  { date: '08/06', inbound: 110, outbound: 105 },
  { date: '08/07', inbound: 135, outbound: 88 },
  { date: '08/08', inbound: 100, outbound: 120 },
  { date: '08/09', inbound: 145, outbound: 95 },
];

/** 出入库趋势图组件 */
const TrendChart: React.FC<TrendChartProps> = ({
  data = defaultData,
  height = 260,
}) => {
  const maxVal = Math.max(...data.map((d) => Math.max(d.inbound, d.outbound)));
  const chartHeight = height - 60;
  const barWidth = 20;
  const gap = 40;

  return (
    <Card
      title="出入库趋势（近7日）"
      style={{ borderRadius: 8 }}
      styles={{ body: { padding: '16px 24px' } }}
    >
      <div style={{ height, position: 'relative' }}>
        {/* 图例 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginBottom: 12 }}>
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#FF9900' }} />
            <span style={{ fontSize: 12, color: '#6B7280' }}>入库</span>
          </Space>
          <Space size={4}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: '#1976D2' }} />
            <span style={{ fontSize: 12, color: '#6B7280' }}>出库</span>
          </Space>
        </div>

        {/* 图表区域 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-around',
            height: chartHeight,
            borderBottom: '1px solid #E8ECEF',
            paddingLeft: 10,
            paddingRight: 10,
          }}
        >
          {data.map((item, index) => {
            const inboundHeight = (item.inbound / maxVal) * chartHeight * 0.85;
            const outboundHeight = (item.outbound / maxVal) * chartHeight * 0.85;

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                  {/* 入库柱 */}
                  <div
                    style={{
                      width: barWidth,
                      height: inboundHeight,
                      background: 'linear-gradient(180deg, #FFB84D 0%, #FF9900 100%)',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.5s ease',
                    }}
                    title={`入库: ${item.inbound}`}
                  />
                  {/* 出库柱 */}
                  <div
                    style={{
                      width: barWidth,
                      height: outboundHeight,
                      background: 'linear-gradient(180deg, #64B5F6 0%, #1976D2 100%)',
                      borderRadius: '3px 3px 0 0',
                      transition: 'height 0.5s ease',
                    }}
                    title={`出库: ${item.outbound}`}
                  />
                </div>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{item.date}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default TrendChart;
