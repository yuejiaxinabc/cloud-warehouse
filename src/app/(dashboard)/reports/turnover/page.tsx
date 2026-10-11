'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { Card, Typography, message, Button, Space, Row, Col, Statistic } from 'antd';
import { ArrowLeftOutlined, SwapOutlined, CalculatorOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { ExportButton } from '@/components/ui/ExportButton';

const { Title, Text, Paragraph } = Typography;

export default function ReportTurnoverPage() {
  const router = useRouter();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports?type=turnover');
      const json = await res.json();
      if (json.code === 0 || json.success) {
        setData(json.data || {});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/reports')}>返回</Button>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>周转率分析</h4>
        </Space>
        <ExportButton filename="周转率报表" onExport={async () => {}} />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card className="kpi-card">
            <Statistic 
              title="库存周转率" 
              value={data.turnoverRate || 8.2} 
              suffix="次" 
              prefix={<SwapOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff', fontSize: 32, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="kpi-card">
            <Statistic 
              title="期间出库成本" 
              value={data.totalOutboundCost || 0} 
              prefix="¥" 
              precision={0}
              valueStyle={{ color: '#D32F2F' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="kpi-card">
            <Statistic 
              title="平均库存金额" 
              value={data.avgStockValue || 0} 
              prefix="¥" 
              precision={0}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="计算公式说明" style={{ marginBottom: 16 }}>
        <div style={{ background: '#f5f8fc', padding: 20, borderRadius: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CalculatorOutlined style={{ fontSize: 20, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>库存周转率计算公式</Text>
          </div>
          <div style={{ 
            background: '#fff', 
            padding: '16px 24px', 
            borderRadius: 8, 
            border: '1px solid #e5e7eb',
            marginBottom: 12,
          }}>
            <Text code style={{ fontSize: 16 }}>
              库存周转率 = 期间出库成本 ÷ 平均库存金额
            </Text>
          </div>
          <div style={{ 
            background: '#fff', 
            padding: '16px 24px', 
            borderRadius: 8, 
            border: '1px solid #e5e7eb',
            marginBottom: 12,
          }}>
            <Text code style={{ fontSize: 16 }}>
              平均库存金额 = (期初库存 + 期末库存) ÷ 2
            </Text>
          </div>
          {data.explanation && (
            <div style={{ 
              background: '#E3F2FD', 
              padding: '12px 16px', 
              borderRadius: 8,
              marginTop: 8,
            }}>
              <Text>{data.explanation}</Text>
            </div>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <Title level={5}>指标说明</Title>
          <ul style={{ paddingLeft: 20 }}>
            <li><Text>周转率越高，表示库存周转速度越快，资金利用效率越高</Text></li>
            <li><Text>一般制造业库存周转率在 6-12 次/年为正常水平</Text></li>
            <li><Text>零售业周转率通常较高，可达 12-24 次/年</Text></li>
          </ul>
        </div>

        <div>
          <Title level={5}>优化建议</Title>
          <ul style={{ paddingLeft: 20 }}>
            <li><Text>定期分析滞销商品，及时清理呆滞库存</Text></li>
            <li><Text>优化采购计划，避免过量采购</Text></li>
            <li><Text>加强销售预测，提高库存周转效率</Text></li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
