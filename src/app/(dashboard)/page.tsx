"use client";

import React, { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Tag, Typography, List, Button, message, Input, Select, Descriptions, Modal } from "antd";
import {
  DatabaseOutlined, ImportOutlined, ExportOutlined, AlertOutlined,
  DollarOutlined, ShoppingOutlined, HomeOutlined,
  PlusOutlined, EyeOutlined, SearchOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

const { Text } = Typography;

const BarChart = dynamic(() => import("recharts").then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(m => m.Bar), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(m => m.ResponsiveContainer), { ssr: false });

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>({});
  const [warehouseValues, setWarehouseValues] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [pendingInbound, setPendingInbound] = useState(0);
  const [pendingOutbound, setPendingOutbound] = useState(0);
  const [pendingTransfer, setPendingTransfer] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    fetch("/api/inventory?pageSize=1000").then(r => r.json()).then(d => {
      if (d.success) {
        const items = d.data?.items || [];
        const totalQty = items.reduce((s: number, i: any) => s + (Number(i.onHand) || 0), 0);
        const totalValue = items.reduce((s: number, i: any) => s + ((Number(i.onHand) || 0) * (Number(i.avgCost) || 0)), 0);
        setStats({ totalQty, totalValue, totalItems: items.length });
      }
    }).catch(() => {});

    Promise.all([
      fetch("/api/warehouse").then(r => r.json()),
      fetch("/api/inventory?pageSize=1000").then(r => r.json()),
    ]).then(([whRes, invRes]) => {
      if (whRes.success) {
        const whs = whRes.data || [];
        const invItems = invRes.success ? (invRes.data?.items || []) : [];
        const whMap = new Map();
        whs.forEach((w: any) => whMap.set(Number(w.id), { key: w.id, name: w.name, products: 0, totalQty: 0, totalValue: 0 }));
        invItems.forEach((item: any) => {
          const wh = whMap.get(Number(item.warehouseId));
          if (wh) { wh.products += 1; wh.totalQty += Number(item.onHand || 0); wh.totalValue += Number(item.onHand || 0) * Number(item.avgCost || 0); }
        });
        whMap.forEach((wh: any) => wh.totalValue = Math.round(wh.totalValue * 100) / 100);
        setWarehouseValues(Array.from(whMap.values()));
      }
    }).catch(() => {});

    fetch("/api/alerts?pageSize=5").then(r => r.json()).then(d => { if (d.success) setAlerts(d.data?.items || []); }).catch(() => {});
    fetch("/api/stock-in?status=DRAFT&pageSize=1").then(r => r.json()).then(d => { if (d.success) setPendingInbound(d.data?.total || 0); }).catch(() => {});
    fetch("/api/stock-out?status=DRAFT&pageSize=1").then(r => r.json()).then(d => { if (d.success) setPendingOutbound(d.data?.total || 0); }).catch(() => {});
    fetch("/api/transfers?status=DRAFT&pageSize=1").then(r => r.json()).then(d => { if (d.success) setPendingTransfer(d.data?.total || 0); }).catch(() => {});

    fetch("/api/reports?type=trend&days=7", { cache: "no-store" }).then(r => {
      console.log("[Trend] status:", r.status);
      return r.json();
    }).then(d => {
      console.log("[Trend] data:", JSON.stringify(d).slice(0, 300));
      if (d.success && Array.isArray(d.data)) setTrendData(d.data);
    }).catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!searchKeyword.trim()) { message.warning("请输入搜索关键词"); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/products/search?keyword=${encodeURIComponent(searchKeyword)}`);
      const data = await res.json();
      if (data.success) { setSearchResults(data.data || []); if ((data.data || []).length === 0) message.info("未找到匹配商品"); }
    } catch { message.error("查询失败"); }
    setSearchLoading(false);
  };

  const kpiData = [
    { title: "库存总量", value: stats.totalQty || 0, suffix: "件", icon: <DatabaseOutlined />, color: "#2563EB" },
    { title: "仓库总价值", value: stats.totalValue || 0, prefix: "¥", precision: 2, icon: <DollarOutlined />, color: "#16A34A" },
    { title: "商品种类", value: stats.totalItems || 0, suffix: "种", icon: <ShoppingOutlined />, color: "#8B5CF6" },
    { title: "预警数量", value: alerts.length, suffix: "条", icon: <AlertOutlined />, color: "#DC2626" },
    { title: "仓库数", value: warehouseValues.length, suffix: "个", icon: <HomeOutlined />, color: "#0891B2" },
  ];

  const todoList = [
    { title: `待处理入库单 (${pendingInbound})`, type: "入库", path: "/stock-in", count: pendingInbound, color: "#16A34A" },
    { title: `待审批出库单 (${pendingOutbound})`, type: "出库", path: "/stock-out", count: pendingOutbound, color: "#2563EB" },
    { title: `待执行调拨单 (${pendingTransfer})`, type: "调拨", path: "/transfers", count: pendingTransfer, color: "#8B5CF6" },
  ];

  const searchColumns = [
    { title: "商品编码", dataIndex: "code", key: "code", width: 100, render: (t: string) => <span className="mono" style={{ fontSize: 13 }}>{t}</span> },
    { title: "商品名称", dataIndex: "name", key: "name", width: 150 },
    { title: "仓库", dataIndex: "warehouseName", key: "warehouseName", width: 100 },
    { title: "货位", dataIndex: "locationCode", key: "locationCode", width: 120, render: (t: string) => t ? <Tag icon={<EnvironmentOutlined />}>{t}</Tag> : "-" },
    { title: "库存数量", dataIndex: "quantity", key: "quantity", width: 100, render: (v: number) => <Text strong style={{ color: "var(--primary)" }}>{v || 0}</Text> },
    { title: "状态", dataIndex: "status", key: "status", width: 80, render: (s: number) => <Tag color={s === 1 ? "green" : "red"}>{s === 1 ? "正常" : "停用"}</Tag> },
    { title: "操作", key: "action", width: 80, render: (_: any, record: any) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setSelectedProduct(record); setDetailModalOpen(true); }}>详情</Button> },
  ];

  const whColumns = [
    { title: "仓库", dataIndex: "name", key: "name" },
    { title: "商品种类", dataIndex: "products", key: "products", align: "center" as const },
    { title: "总数量", dataIndex: "totalQty", key: "totalQty", align: "right" as const, render: (v: number) => v.toLocaleString() },
    { title: "总价值", dataIndex: "totalValue", key: "totalValue", align: "right" as const, render: (v: number) => <Text strong style={{ color: "var(--success)" }}>¥{v.toLocaleString()}</Text> },
  ];

  const alertColumns = [
    { title: "商品", dataIndex: "productName", key: "productName", render: (_: any, r: any) => r.product?.name || r.productName || "-" },
    { title: "类型", dataIndex: "type", key: "type", width: 80, render: (t: string) => <Tag>{t === "LOW_STOCK" ? "低库存" : t === "HIGH_STOCK" ? "高库存" : t === "EXPIRING" ? "临期" : t}</Tag> },
    { title: "级别", dataIndex: "level", key: "level", width: 80, render: (l: string) => <Tag color={l === "CRITICAL" ? "red" : l === "WARNING" ? "orange" : "blue"}>{l === "CRITICAL" ? "严重" : l === "WARNING" ? "警告" : "提示"}</Tag> },
    { title: "信息", dataIndex: "message", key: "message", ellipsis: true },
    { title: "时间", dataIndex: "createdAt", key: "createdAt", width: 140, render: (v: string) => v ? new Date(v).toLocaleString() : "-" },
  ];

  return (
    <div>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>工作台</h4>

      {/* KPI */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {kpiData.map((kpi, i) => (
          <Col xs={12} sm={12} lg={Math.floor(24 / kpiData.length)} key={i}>
            <Card className="kpi-card" size="small" styles={{ body: { padding: isMobile ? "12px 14px" : "16px 20px" } }}>
              <Statistic
                title={kpi.title}
                value={kpi.value}
                suffix={kpi.suffix}
                prefix={kpi.prefix || React.cloneElement(kpi.icon, { style: { color: kpi.color, marginRight: 4 } })}
                precision={kpi.precision}
                valueStyle={{ color: kpi.color, fontSize: isMobile ? 18 : 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 商品查询 */}
      <Card title={<><SearchOutlined /> 商品库存查询</>} style={{ marginBottom: 16 }} styles={{ body: { padding: isMobile ? 12 : 16 } }}>
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, marginBottom: 12 }}>
          <Input
            id="product-search"
            name="product-search"
            prefix={<SearchOutlined />}
            placeholder="输入商品编码/名称/条码/规格/品牌"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ flex: 1 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={searchLoading} block={isMobile}>查询</Button>
        </div>
        <Table columns={searchColumns} dataSource={searchResults} rowKey="id" loading={searchLoading} size="small"
          scroll={{ x: isMobile ? 700 : 800 }} pagination={{ pageSize: 10, size: isMobile ? "small" : "default" }}
          locale={{ emptyText: "输入关键词查询商品库存信息" }} />
      </Card>

      {/* 图表 + 待办 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card title="出入库趋势（近7天）" styles={{ body: { padding: isMobile ? 12 : 16 } }}>
            {trendData.length > 0 ? (
              <div style={{ position: "relative" }}>
                {/* 图例 */}
                <div style={{ display: "flex", gap: 16, marginBottom: 8, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 12, color: "#64748B" }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#2563EB", marginRight: 4 }} />入库</span>
                  <span style={{ fontSize: 12, color: "#64748B" }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#93C5FD", marginRight: 4 }} />出库</span>
                  <span style={{ fontSize: 12, color: "#64748B" }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#8B5CF6", marginRight: 4 }} />调转</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 200, padding: "0 8px" }}>
                  {trendData.map((d: any, idx: number) => {
                    const maxVal = Math.max(...trendData.map((t: any) => Math.max(t.inbound || 0, t.outbound || 0, t.transfer || 0)), 1);
                    const inH = Math.round(((d.inbound || 0) / maxVal) * 160);
                    const outH = Math.round(((d.outbound || 0) / maxVal) * 160);
                    const trH = Math.round(((d.transfer || 0) / maxVal) * 160);
                    return (
                      <div key={idx} onMouseEnter={() => setHoveredTrendIdx(idx)} onMouseLeave={() => setHoveredTrendIdx(null)}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
                        {/* 自定义 Tooltip */}
                        {hoveredTrendIdx === idx && (
                          <div style={{
                            position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)",
                            background: "#0F172A", color: "#fff", borderRadius: 8, padding: "8px 12px",
                            fontSize: 12, lineHeight: "20px", whiteSpace: "nowrap",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 10, marginBottom: 6,
                          }}>
                            <div style={{ fontWeight: 600, marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.15)", paddingBottom: 4 }}>{d.date}</div>
                            <div><span style={{ color: "#60A5FA" }}>●</span> 入库: {d.inbound || 0}</div>
                            <div><span style={{ color: "#93C5FD" }}>●</span> 出库: {d.outbound || 0}</div>
                            <div><span style={{ color: "#A78BFA" }}>●</span> 调转: {d.transfer || 0}</div>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 170 }}>
                          <div style={{ width: 14, height: inH, background: "#2563EB", borderRadius: "3px 3px 0 0", opacity: hoveredTrendIdx !== null && hoveredTrendIdx !== idx ? 0.4 : 1, transition: "opacity 0.15s" }} />
                          <div style={{ width: 14, height: outH, background: "#93C5FD", borderRadius: "3px 3px 0 0", opacity: hoveredTrendIdx !== null && hoveredTrendIdx !== idx ? 0.4 : 1, transition: "opacity 0.15s" }} />
                          <div style={{ width: 14, height: trH, background: "#8B5CF6", borderRadius: "3px 3px 0 0", opacity: hoveredTrendIdx !== null && hoveredTrendIdx !== idx ? 0.4 : 1, transition: "opacity 0.15s" }} />
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{d.date}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ padding: 40, color: "#94A3B8", textAlign: "center" }}>暂无出入库数据</div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="今日待办" extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => router.push("/stock-in")}>新建入库</Button>}
            styles={{ body: { padding: isMobile ? 12 : 16 } }}>
            <List
              dataSource={todoList}
              renderItem={(item) => (
                <List.Item
                  actions={[<Button key="view" type="link" size="small" icon={<EyeOutlined />} onClick={() => router.push(item.path)}>查看</Button>]}
                  style={{ cursor: "pointer", padding: "10px 0" }}
                  onClick={() => router.push(item.path)}
                >
                  <List.Item.Meta
                    avatar={<Tag color={item.color} style={{ margin: 0 }}>{item.type}</Tag>}
                    title={<Text style={{ fontSize: 14 }}>{item.title}</Text>}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 仓库 + 预警 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="仓库货品总价值" styles={{ body: { padding: 0 } }}>
            <Table columns={whColumns} dataSource={warehouseValues} rowKey="key" pagination={false} size="small" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="预警Top" extra={<a href="/alerts" style={{ fontSize: 13 }}>查看全部</a>} styles={{ body: { padding: 0 } }}>
            <Table columns={alertColumns} dataSource={alerts} rowKey="id" pagination={false} size="small" />
          </Card>
        </Col>
      </Row>

      {/* 商品详情 */}
      <Modal title="商品库存详情" open={detailModalOpen} onCancel={() => { setDetailModalOpen(false); setSelectedProduct(null); }} footer={null} width={isMobile ? "95%" : 560}>
        {selectedProduct && (
          <Descriptions column={isMobile ? 1 : 2} bordered size="small">
            <Descriptions.Item label="商品编码">{selectedProduct.code}</Descriptions.Item>
            <Descriptions.Item label="商品名称">{selectedProduct.name}</Descriptions.Item>
            <Descriptions.Item label="条码">{selectedProduct.barcode || "-"}</Descriptions.Item>
            <Descriptions.Item label="分类">{selectedProduct.categoryName || "-"}</Descriptions.Item>
            <Descriptions.Item label="规格">{selectedProduct.spec || "-"}</Descriptions.Item>
            <Descriptions.Item label="品牌">{selectedProduct.brand || "-"}</Descriptions.Item>
            <Descriptions.Item label="所属仓库">{selectedProduct.warehouseName || "-"}</Descriptions.Item>
            <Descriptions.Item label="货位">{selectedProduct.locationCode ? <Tag icon={<EnvironmentOutlined />}>{selectedProduct.locationCode}</Tag> : "-"}</Descriptions.Item>
            <Descriptions.Item label="库存数量"><Text strong style={{ color: "var(--primary)", fontSize: 16 }}>{selectedProduct.quantity || 0}</Text></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={selectedProduct.status === 1 ? "green" : "red"}>{selectedProduct.status === 1 ? "正常" : "停用"}</Tag></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
