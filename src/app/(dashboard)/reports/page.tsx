'use client';

import React from 'react';
import { Card, Row, Col, Typography } from 'antd';
import { BarChartOutlined, SwapOutlined, ClockCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title, Text } = Typography;

const reportCards = [
  {
    title: '收发存报表',
    description: '查看商品的收入、发出、结存汇总数据',
    icon: <FileTextOutlined style={{ fontSize: 32, color: '#1677ff' }} />,
    path: '/reports/summary',
    color: '#E3F2FD',
  },
  {
    title: '周转率分析',
    description: '分析库存周转效率，优化库存管理',
    icon: <SwapOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
    path: '/reports/turnover',
    color: '#F1F8E9',
  },
  {
    title: '库龄分析',
    description: '查看库存库龄分布，识别呆滞库存',
    icon: <ClockCircleOutlined style={{ fontSize: 32, color: '#ED6C02' }} />,
    path: '/reports/aging',
    color: '#FFF3E0',
  },
];

export default function ReportsPage() {
  const router = useRouter();

  return (
    <div className="page-container">
      <h4 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>报表中心</h4>
      
      <Row gutter={[24, 24]}>
        {reportCards.map((card) => (
          <Col xs={24} sm={12} lg={8} key={card.path}>
            <Card
              hoverable
              onClick={() => router.push(card.path)}
              style={{ borderRadius: 12, height: '100%' }}
              styles={{ body: { padding: 24 } }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: card.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {card.icon}
                </div>
                <div>
                  <Title level={5} style={{ margin: 0, marginBottom: 8 }}>{card.title}</Title>
                  <Text type="secondary">{card.description}</Text>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
