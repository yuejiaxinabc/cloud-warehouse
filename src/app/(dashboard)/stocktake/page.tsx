"use client";

import React, { useState, useEffect } from "react";
import { Card, Table, Button, Space, Input, Select, Tag, Modal, Form, message, Typography, Row, Col, DatePicker, InputNumber, Popconfirm } from "antd";
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, CheckCircleOutlined, ScanOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Title, Text } = Typography;
const { Option } = Select;

export default function StocktakePage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { loadOrders(); loadWarehouses(); loadProducts(); }, [keyword, statusFilter, page]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", "15");
      const res = await fetch(`/api/stocktake?${params}`);
      const data = await res.json();
      if (data.success) {
        setOrders(data.data?.items || []);
        setTotal(data.data?.total || 0);
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

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/products?pageSize=1000");
      const data = await res.json();
      if (data.success) setProducts(data.data?.items || []);
    } catch (e) { console.error(e); }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await fetch("/api/stocktake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        message.success("盘点单创建成功");
        setCreateModalOpen(false);
        form.resetFields();
        loadOrders();
      } else {
        message.error(data.error || "创建失败");
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error("创建失败");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/stocktake?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success("删除成功");
        loadOrders();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) { message.error("删除失败"); }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      DRAFT: { color: "default", text: "草稿" },
      IN_PROGRESS: { color: "processing", text: "进行中" },
      COMPLETED: { color: "success", text: "已完成" },
      CANCELLED: { color: "error", text: "已取消" },
    };
    const s = statusMap[status] || { color: "default", text: status };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  const columns = [
    { title: "盘点单号", dataIndex: "orderNo", key: "orderNo", width: isMobile ? 130 : 180, render: (t: string) => <span style={{ fontFamily: "monospace", fontWeight: 500, color: "#1976D2", fontSize: isMobile ? 12 : 14 }}>{t}</span> },
    { title: "仓库", dataIndex: ["warehouse", "name"], key: "warehouse", width: isMobile ? 80 : 120, render: (_: any, r: any) => r.warehouse?.name || "-" },
    ...(!isMobile ? [
      { title: "类型", dataIndex: "type", key: "type", width: 100, render: (t: string) => <Tag>{t === "FULL" ? "全盘" : t === "SAMPLE" ? "抽盘" : "循环盘点"}</Tag> },
    ] : []),
    { title: "状态", dataIndex: "status", key: "status", width: isMobile ? 70 : 100, render: (s: string) => getStatusTag(s) },
    ...(!isMobile ? [
      { title: "计划日期", dataIndex: "planDate", key: "planDate", width: 120, render: (d: string) => d ? new Date(d).toLocaleDateString("zh-CN") : "-" },
      { title: "完成日期", dataIndex: "completedAt", key: "completedAt", width: 120, render: (d: string) => d ? new Date(d).toLocaleDateString("zh-CN") : "-" },
      { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 160, render: (d: string) => d ? new Date(d).toLocaleString("zh-CN") : "-" },
    ] : []),
    {
      title: "操作", key: "action", width: isMobile ? 70 : 150, fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space size={isMobile ? 0 : 4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => router.push(`/stocktake/${record.id}`)}>{isMobile ? "" : "查看"}</Button>
          {!isMobile && record.status === "DRAFT" && (
            <Popconfirm title="确认删除此盘点单？" onConfirm={() => handleDelete(record.id)} okText="确认" cancelText="取消">
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ 
        display: "flex", 
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", 
        marginBottom: isMobile ? 12 : 16,
        gap: isMobile ? 8 : 0
      }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>盘点管理</h4>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }} block={isMobile}>新建盘点单</Button>
      </div>

      <Card>
        <div style={{ 
          display: "flex", 
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between", 
          marginBottom: isMobile ? 12 : 16,
          gap: isMobile ? 8 : 16
        }}>
          <Input prefix={<SearchOutlined />} placeholder="搜索盘点单号" style={{ width: isMobile ? "100%" : 240 }} allowClear onChange={(e) => setKeyword(e.target.value)} />
          <Select placeholder="状态筛选" allowClear style={{ width: isMobile ? "100%" : 120 }} onChange={(v) => setStatusFilter(v)}>
            <Option value="DRAFT">草稿</Option>
            <Option value="IN_PROGRESS">进行中</Option>
            <Option value="COMPLETED">已完成</Option>
            <Option value="CANCELLED">已取消</Option>
          </Select>
        </div>
        <Table 
          columns={columns} 
          dataSource={orders} 
          rowKey="id" 
          loading={loading} 
          scroll={{ x: isMobile ? 500 : 1200 }} 
          pagination={{ current: page, total, pageSize: 15, onChange: setPage, showTotal: (t) => `共 ${t} 条`, size: isMobile ? "small" : "default" }} 
          size={isMobile ? "small" : "middle"}
        />
      </Card>

      <Modal 
        title="新建盘点单" 
        open={createModalOpen} 
        onCancel={() => { setCreateModalOpen(false); form.resetFields(); }} 
        onOk={handleCreate} 
        width={isMobile ? "95%" : 640}
      >
        <Form form={form} layout="vertical">
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="type" label="盘点类型" rules={[{ required: true, message: "请选择盘点类型" }]}>
                <Select placeholder="选择类型">
                  <Option value="FULL">全盘</Option>
                  <Option value="SAMPLE">抽盘</Option>
                  <Option value="CYCLE">循环盘点</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="warehouseId" label="盘点仓库" rules={[{ required: true, message: "请选择仓库" }]}>
                <Select placeholder="选择仓库">
                  {warehouses.map((w: any) => <Option key={w.id} value={w.id}>{w.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="planDate" label="计划日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="备注信息" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
