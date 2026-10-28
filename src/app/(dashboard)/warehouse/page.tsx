"use client";

import React, { useState, useEffect } from "react";
import { Card, Table, Button, Space, Input, Tag, Modal, Form, message, Typography, Row, Col, Statistic, Popconfirm } from "antd";
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, ShopOutlined, EnvironmentOutlined, PhoneOutlined, UserOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function WarehousePage() {
  const [keyword, setKeyword] = useState("");
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form] = Form.useForm();

  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => { loadWarehouses(); }, []);

  const loadWarehouses = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/warehouse");
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch (e) { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editId ? `/api/warehouse?id=${editId}` : "/api/warehouse";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await res.json();
      if (data.success) {
        message.success(editId ? "更新成功" : "创建成功");
        setCreateModalOpen(false);
        form.resetFields();
        setEditId(null);
        loadWarehouses();
      } else {
        message.error(data.error || "操作失败");
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error("操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/warehouse?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success("删除成功");
        loadWarehouses();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) { message.error("删除失败"); }
  };

  const filteredWarehouses = warehouses.filter((w: any) =>
    w.name?.toLowerCase().includes(keyword.toLowerCase()) ||
    w.code?.toLowerCase().includes(keyword.toLowerCase())
  );

  const totalValue = warehouses.reduce((sum: number, w: any) => sum + (w.totalValue || 0), 0);
  const totalQty = warehouses.reduce((sum: number, w: any) => sum + (w.totalQty || 0), 0);

  const columns = [
    { title: "仓库编码", dataIndex: "code", key: "code", width: 110 },
    { title: "仓库名称", dataIndex: "name", key: "name", width: 170 },
    { title: "地址", dataIndex: "address", key: "address", ellipsis: true },
    { title: "联系人", dataIndex: "contact", key: "contact", width: 90 },
    { title: "电话", dataIndex: "phone", key: "phone", width: 120, responsive: ["lg"] as any },
    {
      title: "库存数量", key: "totalQty", width: 100,
      render: (_: any, r: any) => <Text strong>{r.totalQty || 0}</Text>,
    },
    {
      title: "库存价值", key: "totalValue", width: 120,
      render: (_: any, r: any) => <Text type="success">¥{(r.totalValue || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</Text>,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (v: number) => v === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>,
    },
    {
      title: "操作", key: "action", width: 150, fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
            setEditId(record.id);
            form.setFieldsValue(record);
            setCreateModalOpen(true);
          }}>编辑</Button>
          <Popconfirm
            title="确认删除此仓库？"
            description={record.productCount > 0 ? "该仓库有库存，无法删除" : "删除后不可恢复"}
            onConfirm={() => handleDelete(record.id)}
            okText="确认"
            cancelText="取消"
            disabled={record.productCount > 0}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={record.productCount > 0}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">仓库管理</h2>
          <p className="yc-page-desc">仓库、货架与货位结构；新建仓库会自动生成 A–Z 26 个货架 × 100 个货位</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="仓库总数" value={warehouses.length} prefix={<ShopOutlined />} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="库存总量" value={totalQty} suffix="件" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="库存总价值" value={totalValue} prefix="¥" precision={2} />
          </Card>
        </Col>
      </Row>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <Input.Search placeholder="搜索仓库名称或编码" style={{ width: 300 }} allowClear onSearch={setKeyword} onChange={(e) => setKeyword(e.target.value)} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); form.resetFields(); setCreateModalOpen(true); }}>新增仓库</Button>
        </div>
        <Table
          columns={columns}
          dataSource={filteredWarehouses}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          scroll={{ x: 880 }}
        />
      </Card>

      <Modal title={editId ? "编辑仓库" : "新增仓库"} open={createModalOpen} onCancel={() => { setCreateModalOpen(false); setEditId(null); form.resetFields(); }} onOk={handleSubmit} width={isMobile ? "95%" : 600}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="code" label="仓库编码" rules={[{ required: true, message: "请输入仓库编码" }]}>
                <Input prefix={<ShopOutlined />} placeholder="如: WH-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="仓库名称" rules={[{ required: true, message: "请输入仓库名称" }]}>
                <Input placeholder="如: 华东主仓库" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="地址">
            <Input prefix={<EnvironmentOutlined />} placeholder="详细地址" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact" label="联系人">
                <Input prefix={<UserOutlined />} placeholder="联系人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input prefix={<PhoneOutlined />} placeholder="联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
