"use client";

import React, { useState, useEffect } from "react";
import { Card, Table, Button, Space, Input, Tag, Modal, Form, message, Typography, Row, Col, InputNumber, Switch, Radio, Popconfirm, Empty } from "antd";
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from "@ant-design/icons";

const { Text } = Typography;

/**
 * 字典管理（v1.2.3）
 *
 * 左侧：字典类型（分页 + keyword 搜索，可新建/编辑/删除）
 * 右侧：选中类型的字典项（增删改，sort 用数字输入框控制下拉顺序）
 * 系统内置字典（isSystem）只能改名称/状态，删除由后端拦截。
 */
export default function DictPage() {
  // ===== 左侧：字典类型 =====
  const [types, setTypes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState("");
  const [typeLoading, setTypeLoading] = useState(false);

  // ===== 右侧：字典项 =====
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [itemLoading, setItemLoading] = useState(false);

  // ===== 弹窗 =====
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [typeForm] = Form.useForm();

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [itemForm] = Form.useForm();

  useEffect(() => { loadTypes(); }, [page, pageSize]);

  useEffect(() => {
    if (selected?.code) loadItems(selected.code);
    else setItems([]);
  }, [selected?.code]);

  /** 加载字典类型列表；当前选中项已不在列表里时自动落到第一条 */
  const loadTypes = async () => {
    setTypeLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (keyword) qs.set("keyword", keyword);
      const res = await fetch(`/api/dicts?${qs.toString()}`);
      const data = await res.json();
      if (data.success) {
        const list: any[] = data.data?.list || [];
        setTypes(list);
        setTotal(data.data?.total || 0);
        const stillThere = list.find((t: any) => t.code === selected?.code);
        if (stillThere) setSelected(stillThere);
        else if (list.length > 0) setSelected(list[0]);
        else setSelected(null);
      } else {
        message.error(data.error || "加载字典类型失败");
      }
    } catch (e) {
      message.error("加载字典类型失败");
    } finally {
      setTypeLoading(false);
    }
  };

  /** 加载选中类型的字典项（all=1 含停用项，编辑页需要看到全部） */
  const loadItems = async (typeCode: string) => {
    setItemLoading(true);
    try {
      const res = await fetch(`/api/dicts/data?typeCode=${encodeURIComponent(typeCode)}&all=1`);
      const data = await res.json();
      if (data.success) setItems(data.data || []);
      else message.error(data.error || "加载字典项失败");
    } catch (e) {
      message.error("加载字典项失败");
    } finally {
      setItemLoading(false);
    }
  };

  const refreshAll = async () => {
    await loadTypes();
    if (selected?.code) await loadItems(selected.code);
  };

  // ===== 字典类型：新建 / 编辑 =====
  const openTypeModal = (record?: any) => {
    setEditingTypeId(record ? record.id : null);
    typeForm.resetFields();
    if (record) {
      typeForm.setFieldsValue({
        code: record.code,
        name: record.name,
        status: record.status,
        remark: record.remark,
      });
    } else {
      typeForm.setFieldsValue({ status: 1 });
    }
    setTypeModalOpen(true);
  };

  const submitType = async () => {
    try {
      const values = await typeForm.validateFields();
      const editing = editingTypeId !== null;
      const res = await fetch("/api/dicts", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editingTypeId, ...values } : values),
      });
      const data = await res.json();
      if (data.success) {
        message.success(editing ? "字典类型已更新" : "字典类型已创建");
        setTypeModalOpen(false);
        setEditingTypeId(null);
        typeForm.resetFields();
        await loadTypes();
      } else {
        message.error(data.error || "操作失败");
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error("操作失败");
    }
  };

  const deleteType = async (record: any) => {
    try {
      const res = await fetch(`/api/dicts?id=${record.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || "字典类型已删除");
        if (selected?.code === record.code) setSelected(null);
        setItems([]);
        await loadTypes();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) {
      message.error("删除失败");
    }
  };

  // ===== 字典项：新建 / 编辑 =====
  const openItemModal = (record?: any) => {
    if (!selected) {
      message.warning("请先在左侧选择一个字典类型");
      return;
    }
    setEditingItemId(record ? record.id : null);
    itemForm.resetFields();
    if (record) {
      itemForm.setFieldsValue({
        label: record.label,
        value: record.value,
        sort: record.sort,
        status: record.status,
        isDefault: record.isDefault,
        remark: record.remark,
      });
    } else {
      itemForm.setFieldsValue({ sort: (items.length + 1) * 10, status: 1, isDefault: false });
    }
    setItemModalOpen(true);
  };

  const submitItem = async () => {
    try {
      const values = await itemForm.validateFields();
      const editing = editingItemId !== null;
      const payload = editing
        ? { id: editingItemId, ...values }
        : { typeCode: selected?.code, ...values };
      const res = await fetch("/api/dicts/data", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        message.success(editing ? "字典项已更新" : "字典项已新增");
        setItemModalOpen(false);
        setEditingItemId(null);
        itemForm.resetFields();
        if (selected?.code) await loadItems(selected.code);
        await loadTypes();
      } else {
        message.error(data.error || "操作失败");
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error("操作失败");
    }
  };

  const deleteItem = async (record: any) => {
    try {
      const res = await fetch(`/api/dicts/data?id=${record.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success("字典项已删除");
        if (selected?.code) await loadItems(selected.code);
        await loadTypes();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) {
      message.error("删除失败");
    }
  };

  const typeColumns = [
    {
      title: "字典",
      key: "name",
      render: (_: any, r: any) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Text strong>{r.name}</Text>
            {r.isSystem && <Tag color="blue">内置</Tag>}
            {r.status === 0 && <Tag>停用</Tag>}
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.code}</Text>
        </Space>
      ),
    },
    {
      title: "项数",
      dataIndex: "itemCount",
      key: "itemCount",
      width: 64,
      align: "right" as const,
      render: (v: number) => <Text type="secondary">{v || 0}</Text>,
    },
    {
      title: "操作",
      key: "action",
      width: 110,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openTypeModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除此字典类型？"
            description={record.isSystem ? "系统内置字典不允许删除" : "该类型下的字典项会一并清理"}
            onConfirm={() => deleteType(record)}
            okText="确认"
            cancelText="取消"
            disabled={record.isSystem}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={record.isSystem}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const itemColumns = [
    { title: "显示文本", dataIndex: "label", key: "label", ellipsis: true },
    {
      title: "存储值",
      dataIndex: "value",
      key: "value",
      width: 160,
      render: (v: string) => <Text code>{v}</Text>,
    },
    { title: "排序", dataIndex: "sort", key: "sort", width: 72, align: "center" as const },
    {
      title: "默认",
      dataIndex: "isDefault",
      key: "isDefault",
      width: 72,
      align: "center" as const,
      render: (v: boolean) => (v ? <Tag color="gold">默认</Tag> : <Text type="secondary">-</Text>),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (v: number) => (v === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">停用</Tag>),
    },
    {
      title: "备注",
      dataIndex: "remark",
      key: "remark",
      ellipsis: true,
      responsive: ["lg"] as any,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "操作",
      key: "action",
      width: 130,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openItemModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除此字典项？"
            description="删除后使用该值的业务数据不受影响，但下拉框将不再出现"
            onConfirm={() => deleteItem(record)}
            okText="确认"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
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
          <h2 className="yc-page-title">字典管理</h2>
          <p className="yc-page-desc">维护入库类型、出库类型、单据状态等业务字典；系统内置字典只可改名称与状态</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={9}>
          <Card
            title="字典类型"
            size="small"
            extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openTypeModal()}>新建类型</Button>}
          >
            <Input
              allowClear
              placeholder="搜索编码或名称"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => { setPage(1); loadTypes(); }}
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="code"
              size="small"
              loading={typeLoading}
              columns={typeColumns}
              dataSource={types}
              pagination={{
                current: page,
                pageSize,
                total,
                size: "small",
                showSizeChanger: false,
                showTotal: (t) => `共 ${t} 个类型`,
                onChange: (p) => setPage(p),
              }}
              onRow={(record) => ({
                onClick: () => setSelected(record),
                style: {
                  cursor: "pointer",
                  background: record.code === selected?.code ? "#EFF6FF" : undefined,
                },
              })}
            />
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card
            size="small"
            title={selected ? `${selected.name}（${selected.code}）字典项` : "字典项"}
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                disabled={!selected}
                onClick={() => openItemModal()}
              >
                新增字典项
              </Button>
            }
          >
            {selected ? (
              <Table
                rowKey="id"
                size="small"
                loading={itemLoading}
                columns={itemColumns}
                dataSource={items}
                pagination={false}
                scroll={{ x: 720 }}
              />
            ) : (
              <Empty description="请先在左侧选择（或新建）一个字典类型" />
            )}
          </Card>
        </Col>
      </Row>

      {/* 字典类型弹窗 */}
      <Modal
        title={editingTypeId !== null ? "编辑字典类型" : "新建字典类型"}
        open={typeModalOpen}
        onOk={submitType}
        onCancel={() => { setTypeModalOpen(false); setEditingTypeId(null); typeForm.resetFields(); }}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={typeForm} layout="vertical" preserve={false}>
          <Form.Item
            name="code"
            label="字典编码"
            rules={[{ required: true, message: "请输入字典编码" }]}
            extra={editingTypeId !== null ? "编码创建后不可修改" : "字母开头，如 stock_in_type"}
          >
            <Input placeholder="stock_in_type" disabled={editingTypeId !== null} />
          </Form.Item>
          <Form.Item name="name" label="字典名称" rules={[{ required: true, message: "请输入字典名称" }]}>
            <Input placeholder="入库类型" />
          </Form.Item>
          <Form.Item name="status" label="状态" initialValue={1}>
            <Radio.Group>
              <Radio value={1}>启用</Radio>
              <Radio value={0}>停用</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 字典项弹窗 */}
      <Modal
        title={editingItemId !== null ? "编辑字典项" : "新增字典项"}
        open={itemModalOpen}
        onOk={submitItem}
        onCancel={() => { setItemModalOpen(false); setEditingItemId(null); itemForm.resetFields(); }}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={itemForm} layout="vertical" preserve={false}>
          <Form.Item label="所属字典">
            <Input value={selected ? `${selected.name}（${selected.code}）` : ""} disabled />
          </Form.Item>
          <Form.Item name="label" label="显示文本" rules={[{ required: true, message: "请输入显示文本" }]}>
            <Input placeholder="采购入库" />
          </Form.Item>
          <Form.Item
            name="value"
            label="存储值"
            rules={[{ required: true, message: "请输入存储值" }]}
            extra="业务表里实际落库的值，同类型下唯一"
          >
            <Input placeholder="PURCHASE" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sort" label="排序" extra="数值越小越靠前" initialValue={10}>
                <InputNumber min={0} max={9999} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <Radio.Group>
                  <Radio value={1}>启用</Radio>
                  <Radio value={0}>停用</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="isDefault" label="设为默认项" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
