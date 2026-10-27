"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Table, Tabs, Tag, Typography, InputNumber, Space, Button, Statistic, Row, Col, message, Alert } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

const money = (n: number) => Number(n || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventoryAnalysisPage() {
  const [tab, setTab] = useState("recon");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [days, setDays] = useState(90);

  const load = useCallback(async (type: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/analysis?type=${type}&days=${days}`, { cache: "no-store" });
      const j = await res.json();
      if (j.success) setData(j.data);
      else message.error(j.error || "加载失败");
    } catch {
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(tab); }, [tab, load]);

  const reconCols = [
    { title: "商品编码", dataIndex: "productCode", width: 120 },
    { title: "商品名称", dataIndex: "productName", width: 180, ellipsis: true },
    { title: "仓库", dataIndex: "warehouseName", width: 110 },
    { title: "库存余额", dataIndex: "onHand", width: 110, render: (v: number) => money(v) },
    { title: "流水累计", dataIndex: "txnSum", width: 110, render: (v: number) => money(v) },
    { title: "差异", dataIndex: "diff", width: 110, render: (v: number) => <Text type={Math.abs(v) > 0.001 ? "danger" : undefined}>{money(v)}</Text> },
    {
      title: "状态", dataIndex: "status", width: 110,
      render: (s: string) => s === "mismatch" ? <Tag color="error">账实不符</Tag> : <Tag color="warning">无流水</Tag>,
    },
  ];

  const staleCols = [
    { title: "商品编码", dataIndex: "productCode", width: 120 },
    { title: "商品名称", dataIndex: "productName", width: 180, ellipsis: true },
    { title: "仓库", dataIndex: "warehouseName", width: 110 },
    { title: "库存量", dataIndex: "quantity", width: 100, render: (v: number) => money(v) },
    { title: "占用金额", dataIndex: "amount", width: 120, render: (v: number) => money(v) },
    { title: "最后变动", dataIndex: "lastMoveAt", width: 160, render: (v: string) => v ? new Date(v).toLocaleString("zh-CN") : "-" },
    { title: "呆滞天数", dataIndex: "idleDays", width: 100, render: (v: number) => <Tag color={v >= 180 ? "red" : v >= 90 ? "orange" : "default"}>{v} 天</Tag> },
  ];

  const abcCols = [
    { title: "等级", dataIndex: "grade", width: 70, render: (g: string) => <Tag color={g === "A" ? "red" : g === "B" ? "orange" : "default"}>{g}</Tag> },
    { title: "商品编码", dataIndex: "productCode", width: 120 },
    { title: "商品名称", dataIndex: "productName", width: 180, ellipsis: true },
    { title: "出库金额", dataIndex: "outboundAmount", width: 130, render: (v: number) => money(v) },
    { title: "占比%", dataIndex: "share", width: 90 },
    { title: "累计占比%", dataIndex: "cumulativeShare", width: 110 },
  ];

  const replCols = [
    {
      title: "紧急度", dataIndex: "urgency", width: 90,
      render: (u: string) => <Tag color={u === "缺货" ? "red" : u === "紧急" ? "orange" : "gold"}>{u}</Tag>,
    },
    { title: "商品编码", dataIndex: "productCode", width: 120 },
    { title: "商品名称", dataIndex: "productName", width: 180, ellipsis: true },
    { title: "仓库", dataIndex: "warehouseName", width: 110 },
    { title: "现有库存", dataIndex: "onHand", width: 100, render: (v: number) => money(v) },
    { title: "安全库存", dataIndex: "safetyStock", width: 100, render: (v: number) => money(v) },
    { title: "建议补货", dataIndex: "suggestQty", width: 110, render: (v: number) => <Text strong>{money(v)}</Text> },
    { title: "预计金额", dataIndex: "estCost", width: 120, render: (v: number) => money(v) },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>库存分析</Title>
      <Text type="secondary">账实对账、呆滞料、ABC 分类、补货建议 —— 用来发现账不平和压资金的地方。</Text>

      <Card size="small" style={{ marginTop: 16 }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          tabBarExtraContent={
            <Space>
              {tab === "stale" && (
                <Space size={4}>
                  <Text type="secondary">呆滞阈值</Text>
                  <InputNumber size="small" min={1} max={3650} value={days} onChange={(v) => setDays(Number(v) || 90)} style={{ width: 80 }} />
                  <Text type="secondary">天</Text>
                </Space>
              )}
              <Button size="small" icon={<ReloadOutlined />} onClick={() => load(tab)} loading={loading}>刷新</Button>
            </Space>
          }
          items={[
            {
              key: "recon",
              label: "账实对账",
              children: (
                <>
                  <Row gutter={16} style={{ marginBottom: 12 }}>
                    <Col span={8}><Statistic title="库存记录数" value={data?.total ?? 0} /></Col>
                    <Col span={8}><Statistic title="账实不符" value={data?.mismatchCount ?? 0} valueStyle={{ color: (data?.mismatchCount ?? 0) > 0 ? "#cf1322" : undefined }} /></Col>
                    <Col span={8}><Statistic title="无流水记录" value={data?.noTxnCount ?? 0} /></Col>
                  </Row>
                  {(data?.mismatchCount ?? 0) > 0 && (
                    <Alert type="error" showIcon style={{ marginBottom: 12 }}
                      message="存在账实不符的库存"
                      description="库存余额与流水累计对不上，说明有绕过流水直接改库存的操作，或历史数据未补流水。" />
                  )}
                  <Table rowKey={(r: any) => r.productCode + r.warehouseName} size="small" loading={loading}
                    columns={reconCols as any} dataSource={data?.rows || []} pagination={{ pageSize: 20 }} scroll={{ x: 900 }} />
                </>
              ),
            },
            {
              key: "stale",
              label: "呆滞料 / 库龄",
              children: (
                <>
                  <Row gutter={16} style={{ marginBottom: 12 }}>
                    <Col span={12}><Statistic title="呆滞品项" value={data?.count ?? 0} /></Col>
                    <Col span={12}><Statistic title="占用资金" value={money(data?.amount ?? 0)} prefix="¥" /></Col>
                  </Row>
                  <Table rowKey={(r: any) => r.productCode + r.warehouseName} size="small" loading={loading}
                    columns={staleCols as any} dataSource={data?.rows || []} pagination={{ pageSize: 20 }} scroll={{ x: 900 }} />
                </>
              ),
            },
            {
              key: "abc",
              label: "ABC 分类",
              children: (
                <>
                  <Row gutter={16} style={{ marginBottom: 12 }}>
                    <Col span={6}><Statistic title="A 类" value={data?.summary?.A ?? 0} valueStyle={{ color: "#cf1322" }} /></Col>
                    <Col span={6}><Statistic title="B 类" value={data?.summary?.B ?? 0} valueStyle={{ color: "#fa8c16" }} /></Col>
                    <Col span={6}><Statistic title="C 类" value={data?.summary?.C ?? 0} /></Col>
                    <Col span={6}><Statistic title="近一年出库金额" value={money(data?.totalAmount ?? 0)} prefix="¥" /></Col>
                  </Row>
                  <Text type="secondary">按近一年出库金额帕累托分级：累计 70% 为 A、90% 为 B、其余 C。A 类应高频盘点、重点保障。</Text>
                  <Table rowKey={(r: any) => r.productCode} size="small" loading={loading} style={{ marginTop: 12 }}
                    columns={abcCols as any} dataSource={data?.rows || []} pagination={{ pageSize: 20 }} scroll={{ x: 800 }} />
                </>
              ),
            },
            {
              key: "replenish",
              label: "补货建议",
              children: (
                <>
                  <Alert type="info" showIcon style={{ marginBottom: 12 }}
                    message="低于安全库存的商品"
                    description="建议补货量按「目标库存（上限库存/安全库存×2）− 现有库存」计算，可直接据此生成采购申请。" />
                  <Table rowKey={(r: any) => r.productCode + r.warehouseName} size="small" loading={loading}
                    columns={replCols as any} dataSource={data?.rows || []} pagination={{ pageSize: 20 }} scroll={{ x: 900 }} />
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
