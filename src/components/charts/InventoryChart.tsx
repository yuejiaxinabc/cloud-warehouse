'use client';

import React from 'react';
import { Card } from 'antd';

/** 库存水位数据 */
interface InventoryLevel {
  name: string;
  current: number;
  safety: number;
  max: number;
}

interface InventoryChartProps {
  data?: InventoryLevel[];
  height?: number;
}

/** 默认演示数据 */
const defaultData: InventoryLevel[] = [
  { name: '商品A', current: 850, safety: 200, max: 1000 },
  { name: '商品B', current: 120, safety: 150, max: 800 },
  { name: '商品C', current: 450, safety: 100, max: 600 },
  { name: '商品D', current: 680, safety: 300, max: 900 },
  { name: '商品E', current: 200, safety: 250, max: 700 },
];

/** 库存水位图组件 */
const InventoryChart: React.FC<InventoryChartProps> = ({
  data = defaultData,
  height = 300,
}) => {
  /** 计算水位百分比 */
  const getLevelColor = (current: number, safety: number, max: number) => {
    const ratio = current / max;
    if (current < safety) return '#D32F2F';
    if (ratio < 0.3) return '#ED6C02';
    if (ratio < 0.8) return '#2E7D32';
    return '#1976D2';
  };

  return (
    <Card
      title="库存水位"
      style={{ borderRadius: 8 }}
      styles={{ body: { padding: '16px 24px' } }}
    >
      <div style={{ height, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {data.map((item, index) => {
          const percent = Math.min((item.current / item.max) * 100, 100);
          const safetyPercent = (item.safety / item.max) * 100;
          const color = getLevelColor(item.current, item.safety, item.max);

          return (
            <div key={index}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>
                  {item.current} / {item.max}
                </span>
              </div>
              <div
                style={{
                  height: 20,
                  background: '#F3F4F6',
                  borderRadius: 4,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* 当前库存条 */}
                <div
                  style={{
                    height: '100%',
                    width: `${percent}%`,
                    background: color,
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                    opacity: 0.85,
                  }}
                />
                {/* 安全线标记 */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${safetyPercent}%`,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: '#D32F2F',
                    opacity: 0.6,
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 2,
                }}
              >
                <span style={{ fontSize: 11, color }}>
                  {current < safety ? '⚠ 低于安全库存' : '正常'}
                </span>
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                  安全线: {item.safety}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default InventoryChart;
