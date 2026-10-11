"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, Table, Button, Space, Input, Select, Tag, Typography, Row, Col, Statistic, Popconfirm, message, Modal, Descriptions, Tabs, Empty, Spin } from "antd";
import { SearchOutlined, DatabaseOutlined, DollarOutlined, DownloadOutlined, DeleteOutlined, EyeOutlined, EnvironmentOutlined, TagsOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;
const { Option } = Select;

export default function InventoryPage() {
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<number>();
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ totalQty: 0, totalValue: 0, totalItems: 0 });
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 防抖：keyword 变化后 400ms 才触发搜索
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 400);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [keyword]);

  // 用防抖后的 keyword 触发查询
  useEffect(() => { loadData(); }, [debouncedKeyword, warehouseFilter, page]);
  useEffect(() => { loadWarehouses(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedKeyword) params.set("keyword", debouncedKeyword);
      if (warehouseFilter) params.set("warehouseId", String(warehouseFilter));
      params.set("page", String(page));
      params.set("pageSize", "20");
      const res = await fetch(`/api/inventory?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const list = data.data?.items || [];
        setItems(list);
        setTotal(data.data?.total || 0);
        const totalQty = list.reduce((s: number, i: any) => s + Number(i.onHand || 0), 0);
        const totalValue = list.reduce((s: number, i: any) => s + (Number(i.onHand || 0) * Number(i.avgCost || 0)), 0);
        setStats({ totalQty, totalValue, totalItems: list.length });
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadWarehouses = async () => {
    try {
      const res = await fetch("/api/warehouse");
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/inventory?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) { message.success("删除成功"); loadData(); }
      else message.error(data.error || "删除失败");
    } catch (e) { message.error("删除失败"); }
  };

  const handleViewDetail = async (record: any) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/inventory?id=${record.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) setDetail(data.data);
      else message.error(data.error || "加载失败");
    } catch (e) { message.error("加载失败"); }
    setDetailLoading(false);
  };

  const handleExport = () => {
    const headers = ["SKU", "商品名称", "仓库", "在库量", "锁定量", "可用量", "成本价", "库存价值"];
    const rows = items.map((r: any) => [
      r.product?.code || "", r.product?.name || "", r.warehouse?.name || "",
      r.onHand || 0, r.locked || 0, (r.onHand || 0) - (r.locked || 0),
      r.avgCost || 0, ((r.onHand || 0) * (r.avgCost || 0)),
    ]);
    const csv = [headers.join(","), ...rows.map((r: any) => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `库存明细_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { title: "商品编码", dataIndex: ["product", "code"], key: "sku", width: 120, render: (_: any, r: any) => <Text strong>{r.product?.code || "-"}</Text> },
    { title: "商品名称", dataIndex: ["product", "name"], key: "name", width: 180, render: (_: any, r: any) => r.product?.name || "-" },
    { title: "仓库", dataIndex: ["warehouse", "name"], key: "warehouse", width: 120, render: (_: any, r: any) => <Tag color="blue">{r.warehouse?.name || "-"}</Tag> },
    {
      title: "货位分布", key: "locationCount", width: 110,
      render: (_: any, r: any) => r.locationCount > 0
        ? <Tag icon={<EnvironmentOutlined />} color="geekblue">{r.locationCount} 个货位</Tag>
        : <Text type="secondary">-</Text>,
    },
    {
      title: "批次", key: "lotCount", width: 110,
      render: (_: any, r: any) => (r.lots && r.lots.length > 0)
        ? <Tag icon={<TagsOutlined />} color="purple">{r.lots.length} 个批次</Tag>
        : <Text type="secondary">-</Text>,
    },
    { title: "在库量", dataIndex: "onHand", key: "onHand", width: 100, render: (v: any) => <span style={{ fontWeight: 600 }}>{Number(v || 0).toLocaleString()}</span> },
    { title: "锁定量", dataIndex: "locked", key: "locked", width: 80, render: (v: any) => Number(v || 0) > 0 ? <Tag color="orange">{Number(v)}</Tag> : 0 },
    { title: "可用量", key: "available", width: 100, render: (_: any, r: any) => { const v = Number(r.onHand || 0) - Number(r.locked || 0); return <Text style={{ color: v > 0 ? "#52c41a" : "#ff4d4f", fontWeight: 600 }}>{v.toLocaleString()}</Text>; } },
    { title: "成本价", dataIndex: "avgCost", key: "avgCost", width: 100, render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : "-" },
    { title: "库存价值", key: "value", width: 120, render: (_: any, r: any) => { const v = Number(r.onHand || 0) * Number(r.avgCost || 0); return <Text strong style={{ color: "#52c41a" }}>¥{v.toLocaleString()}</Text>; } },
    {
      title: "操作", key: "action", width: 140, fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>详情</Button>
          <Popconfirm title="确认删除此库存记录？" onConfirm={() => handleDelete(record.id)} okText="确认" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detailInv = detail?.inventory || null;
  const locationStocks = detail?.locationStocks || [];
  const lots = detail?.lots || [];

  const locationColumns = [
    { title: "货位编码", dataIndex: "locationCode", key: "code", render: (v: string) => <Text strong style={{ fontFamily: "monospace" }}>{v}</Text> },
    { title: "货位名称", dataIndex: "locationName", key: "name", width: 120 },
    { title: "批次号", dataIndex: "lotNumber", key: "lot", width: 160, render: (v: string) => v ? <Tag color="purple">{v}</Tag> : "-" },
    { title: "数量", dataIndex: "quantity", key: "qty", width: 100, render: (v: any) => <Text strong style={{ color: "#1677ff" }}>{Number(v).toLocaleString()}</Text> },
  ];

  const lotColumns = [
    { title: "批次号", dataIndex: "lotNumber", key: "lot", render: (v: string) => <Tag color="purple" style={{ fontFamily: "monospace" }}>{v}</Tag> },
    { title: "数量", dataIndex: "quantity", key: "qty", width: 100, render: (v: any) => <Text strong>{Number(v).toLocaleString()}</Text> },
    { title: "成本价", dataIndex: "costPrice", key: "cost", width: 100, render: (v: any) => v ? `¥${Number(v).toFixed(2)}` : "-" },
    { title: "状态", dataIndex: "status", key: "status", width: 80, render: (v: any) => v === 1 ? <Tag color="green">可用</Tag> : v === 2 ? <Tag color="orange">冻结</Tag> : <Tag color="red">过期</Tag> },
    { title: "生产日期", dataIndex: "producedAt", key: "produced", width: 120, render: (v: any) => v ? new Date(v).toLocaleDateString() : "-" },
    { title: "到期日期", dataIndex: "expiredAt", key: "expired", width: 120, render: (v: any) => v ? new Date(v).toLocaleDateString() : "-" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h4 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>库存查询</h4>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="库存总量" value={stats.totalQty} suffix="件" valueStyle={{ color: "#1677ff" }} /></Card></Col>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="库存总价值" value={stats.totalValue} prefix="¥" precision={2} valueStyle={{ color: "#52c41a" }} /></Card></Col>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="库存条目" value={stats.totalItems} suffix="条" valueStyle={{ color: "#1677ff" }} /></Card></Col>
      </Row>

      <Card title="库存明细" extra={<Button icon={<DownloadOutlined />} onClick={handleExport}>导出Excel</Button>}>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input prefix={<SearchOutlined />} placeholder="搜索商品名称/SKU/条码" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: 240 }} allowClear />
          <Select placeholder="选择仓库" allowClear style={{ width: 150 }} onChange={(v) => { setWarehouseFilter(v); setPage(1); }}>
            {warehouses.map((w: any) => <Option key={w.id} value={w.id}>{w.name}</Option>)}
          </Select>
          <Text type="secondary" style={{ fontSize: 12 }}>💡 点击"详情"查看货位分布和批次明细</Text>
        </Space>
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: isMobile ? 800 : 1400 }}
          pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: (t) => `共 ${t} 条` }}
          size="small"
          onRow={(record) => ({ onClick: () => handleViewDetail(record), style: { cursor: "pointer" } })}
        />
      </Card>

      <Modal
        title={detailInv ? `库存详情 - ${detailInv.product?.name || ""} (${detailInv.product?.code || ""})` : "库存详情"}
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetail(null); }}
        footer={null}
        width={860}
      >
        {detailLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Spin /></div>
        ) : detailInv ? (
          <div>
            <Descriptions size="small" column={3} style={{ marginBottom: 16 }} bordered>
              <Descriptions.Item label="仓库"><Tag color="blue">{detailInv.warehouse?.name || "-"}</Tag></Descriptions.Item>
              <Descriptions.Item label="在库量"><Text strong style={{ color: "#1677ff" }}>{Number(detailInv.onHand || 0).toLocaleString()}</Text></Descriptions.Item>
              <Descriptions.Item label="锁定量">{Number(detailInv.locked || 0)}</Descriptions.Item>
              <Descriptions.Item label="可用量">{Number(detailInv.onHand || 0) - Number(detailInv.locked || 0)}</Descriptions.Item>
              <Descriptions.Item label="成本价">{detailInv.avgCost ? `¥${Number(detailInv.avgCost).toFixed(2)}` : "-"}</Descriptions.Item>
              <Descriptions.Item label="库存价值"><Text strong style={{ color: "#52c41a" }}>¥{(Number(detailInv.onHand || 0) * Number(detailInv.avgCost || 0)).toLocaleString()}</Text></Descriptions.Item>
            </Descriptions>

            <Tabs
              items={[
                {
                  key: "locations",
                  label: `货位分布 (${locationStocks.length})`,
                  children: locationStocks.length > 0 ? (
                    <Table columns={locationColumns} dataSource={locationStocks} rowKey="id" size="small" pagination={false} />
                  ) : <Empty description="暂无货位明细" />,
                },
                {
                  key: "lots",
                  label: `批次明细 (${lots.length})`,
                  children: lots.length > 0 ? (
                    <Table columns={lotColumns} dataSource={lots} rowKey="id" size="small" pagination={false} />
                  ) : <Empty description="暂无批次记录" />,
                },
              ]}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
