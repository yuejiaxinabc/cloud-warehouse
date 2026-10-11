'use client';

import React, { useState, useEffect } from "react";
import { Card, Table, Button, Space, Input, Select, Tag, Row, Col, Modal, Form, message, Typography, InputNumber, Drawer, Descriptions, List, Popconfirm, Tabs, Statistic, Divider, Alert, Upload } from "antd";
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, EyeOutlined, AppstoreOutlined, HistoryOutlined, DollarOutlined, HomeOutlined, EnvironmentOutlined, InfoCircleOutlined, UploadOutlined } from "@ant-design/icons";


const { Title, Text } = Typography;
const { Option } = Select;

export default function ProductsPage() {
  const [keyword, setKeyword] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [priceHistory, setPriceHistory] = useState<any>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [availableLocations, setAvailableLocations] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
      const [locationCodeInput, setLocationCodeInput] = useState<string>('');
  const [initialStockVal, setInitialStockVal] = useState<number>(0);
  const [initialCostVal, setInitialCostVal] = useState<number>(0);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [form] = Form.useForm();
  const [catForm] = Form.useForm();
  const [unitForm] = Form.useForm();
  const [editId, setEditId] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);


  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      params.set("page", String(page));
      params.set("pageSize", "15");
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.data.items || []);
        setTotal(data.data.total || 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadCategories = async () => {
    try {
      const res = await fetch("/api/products/categories");
      const data = await res.json();
      if (data.success) setCategories(data.data || []);
    } catch (e) { console.error(e); }
  };

  const loadUnits = async () => {
    try {
      const res = await fetch("/api/products/units");
      const data = await res.json();
      if (data.success) setUnits(data.data || []);
    } catch (e) { console.error(e); }
  };

  const loadWarehouses = async () => {
    try {
      const res = await fetch("/api/warehouse");
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch (e) { console.error(e); }
  };

  // 加载可用货位（按顺序，显示剩余容量）
  const loadAvailableLocations = async (warehouseId: number) => {
    setLocationsLoading(true);
    try {
      const res = await fetch(`/api/warehouse/locations/available?warehouseId=${warehouseId}`);
      const data = await res.json();
      if (data.success) {
        setAvailableLocations(data.data || []);
      }
    } catch (e) { console.error(e); }
    setLocationsLoading(false);
  };

  const loadPriceHistory = async (productId: number) => {
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/price-history`);
      const data = await res.json();
      if (data.success) {
        setPriceHistory(data.data);
      }
    } catch (e) { console.error(e); }
    setPriceLoading(false);
  };

  useEffect(() => { loadProducts(); loadCategories(); loadUnits(); loadWarehouses(); }, [page, keyword]);

  const handleViewDetail = (record: any) => {
    setSelectedProduct(record);
    setDetailOpen(true);
    loadPriceHistory(record.id);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success("删除成功");
        loadProducts();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) {
      message.error("删除失败");
    }
  };

  

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // 手动验证仓库库位
      if (!editId) {
        if (!selectedWarehouseId) { message.warning('请选择仓库'); return; }
        if (!locationCodeInput.trim()) { message.warning('请输入货位编码'); return; }
        const locParts = locationCodeInput.trim().split('-');
        if (locParts.length !== 4) { message.warning('货位格式错误，应为 如 A-1-1-1'); return; }
        if (!initialStockVal || initialStockVal <= 0) { message.warning('请输入初始数量'); return; }
      }
      const url = editId ? "/api/products" : "/api/products";
      const method = editId ? "PUT" : "POST";
      let body: any;
      if (editId) {
        body = { ...values, id: editId, imageUrl: imageUrl || null };
      } else {
        body = {
          ...values,
          imageUrl: imageUrl || null,
          warehouseId: Number(selectedWarehouseId),
          locationCode: locationCodeInput.trim(),
          initialStock: initialStockVal,
          initialCost: initialCostVal || 0,
        };
      }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        message.success(editId ? "更新成功" : "创建成功");
        setCreateModalOpen(false);
        form.resetFields();
        setEditId(null); setSelectedWarehouseId(""); setSelectedLocationId(""); setLocationCodeInput("");
        setInitialStockVal(0); setInitialCostVal(0);
        setAvailableLocations([]);
        loadProducts();
      } else {
        message.error(data.error || "操作失败");
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error("操作失败");
    }
  };

  const handleCreateCategory = async () => {
    try {
      const values = await catForm.validateFields();
      const res = await fetch("/api/products/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await res.json();
      if (data.success) {
        message.success("分类创建成功");
        setCategoryModalOpen(false);
        catForm.resetFields();
        loadCategories();
      } else {
        message.error(data.error || "创建失败");
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error("创建失败");
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      const res = await fetch(`/api/products/categories?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success("分类删除成功");
        loadCategories();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) {
      message.error("删除失败");
    }
  };

  const handleCreateUnit = async () => {
    try {
      const values = await unitForm.validateFields();
      const res = await fetch("/api/products/units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = await res.json();
      if (data.success) {
        message.success("单位创建成功");
        setUnitModalOpen(false);
        unitForm.resetFields();
        loadUnits();
      } else {
        message.error(data.error || "创建失败");
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error("创建失败");
    }
  };

  const handleDeleteUnit = async (id: number) => {
    try {
      const res = await fetch(`/api/products/units?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        message.success("单位删除成功");
        loadUnits();
      } else {
        message.error(data.error || "删除失败");
      }
    } catch (e) {
      message.error("删除失败");
    }
  };



  const columns = [
    { title: "图片", dataIndex: "imageUrl", key: "imageUrl", width: 60, render: (url: string) => url ? <img src={url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} /> : <span style={{ color: '#ccc' }}>—</span> },
    { title: "SKU", dataIndex: "code", key: "code", width: isMobile ? 80 : 100, render: (t: string) => <span style={{ fontFamily: "monospace", fontSize: isMobile ? 12 : 14 }}>{t}</span> },
    { title: "商品名称", dataIndex: "name", key: "name", width: isMobile ? 100 : 160, ellipsis: true },
    { title: "分类", dataIndex: ["category", "name"], key: "category", width: isMobile ? 70 : 100, render: (_: any, r: any) => r.category?.name || "-" },
    ...(!isMobile ? [
      { title: "单位", dataIndex: "unit", key: "unit", width: 60, render: (_: any, r: any) => r.unit?.name || r.unit || "-" },
      { title: "条码", dataIndex: "barcode", key: "barcode", width: 120, render: (t: string) => t || "-" },
      { title: "成本方法", dataIndex: "costMethod", key: "costMethod", width: 90, render: (t: string) => ({ WEIGHTED: "移动加权", FIFO: "先进先出", MONTHLY: "月度加权" } as Record<string, string>)[t] || t || "移动加权" },
    ] : []),
    { title: "库存", dataIndex: "totalStock", key: "totalStock", width: isMobile ? 60 : 80, render: (v: any) => <Text strong>{v || 0}</Text> },
    { title: "状态", dataIndex: "status", key: "status", width: isMobile ? 50 : 70, render: (s: number) => <Tag color={s === 1 ? "green" : "red"}>{s === 1 ? "启用" : "停用"}</Tag> },
    {
      title: "操作", key: "action", width: isMobile ? 80 : 150, fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space size={isMobile ? 0 : 4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>{isMobile ? "" : "详情"}</Button>
          {!isMobile && (
            <>
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => {
                setEditId(record.id); setImageUrl(record.imageUrl || ""); setFileList(record.imageUrl ? [{ uid: "-1", name: "图片", status: "done", url: record.imageUrl }] : []);
                form.setFieldsValue(record);
                setCreateModalOpen(true);
              }}>编辑</Button>
              <Popconfirm title="确定删除此商品？" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const priceHistoryColumns = [
    { title: "日期", dataIndex: "date", key: "date", width: 120, render: (t: string) => t ? new Date(t).toLocaleDateString("zh-CN") : "-" },
    { title: "类型", dataIndex: "type", key: "type", width: 80, render: (t: string) => {
      const colorMap: Record<string, string> = { "入库": "green", "出库": "blue", "批次": "orange" };
      return <Tag color={colorMap[t] || "default"}>{t}</Tag>;
    }},
    { title: "单号/批号", dataIndex: "orderNo", key: "orderNo", width: 140 },
    { title: "单价", dataIndex: "price", key: "price", width: 100, render: (v: number) => <span style={{ fontWeight: 600, color: "#1890ff" }}>¥{Number(v || 0).toFixed(2)}</span> },
    { title: "数量", dataIndex: "qty", key: "qty", width: 80 },
  ];

  // 计算货位分配预览


  return (
    <div style={{ padding: isMobile ? 0 : 0 }}>
      <div style={{ 
        display: "flex", 
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between", 
        marginBottom: isMobile ? 12 : 16,
        gap: isMobile ? 8 : 0
      }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>商品管理</h4>
        <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: isMobile ? "100%" : "auto" }}>

          <Button onClick={() => setCategoryModalOpen(true)} block={isMobile}>分类管理</Button>
          <Button onClick={() => setUnitModalOpen(true)} block={isMobile}>单位管理</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditId(null); setSelectedLocationId(""); form.resetFields(); setAvailableLocations([]); setFileList([]); setImageUrl(""); setCreateModalOpen(true); }} block={isMobile}>新建商品</Button>
        </Space>
      </div>

      <Row gutter={isMobile ? 0 : 16}>
        <Col xs={24} sm={24}>
          <Card>
            <div style={{ marginBottom: 16, display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 8 : 16 }}>
              <Input prefix={<SearchOutlined />} placeholder="搜索商品名称/SKU/条码" value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: isMobile ? "100%" : 240 }} allowClear />
              <Button type="primary" icon={<SearchOutlined />} onClick={loadProducts} block={isMobile}>查询</Button>
            </div>

            <Table
              columns={columns}
              dataSource={products}
              rowKey="id"
              loading={loading}
              scroll={{ x: isMobile ? 500 : 1000 }}
              pagination={{ current: page, total, pageSize: 15, onChange: setPage, showTotal: (t) => `共 ${t} 条`, size: isMobile ? "small" : "default" }}
              size={isMobile ? "small" : "small"}
            />
          </Card>
        </Col>
      </Row>

      {/* 新建/编辑商品 */}
      <Modal 
        title={editId ? "编辑商品" : "新建商品"} 
        open={createModalOpen} 
        onCancel={() => { setCreateModalOpen(false); setEditId(null); setSelectedLocationId(""); setAvailableLocations([]); setImageUrl(""); setFileList([]); }} 
        width={isMobile ? "95%" : 720}
        onOk={handleSubmit}
      >
        <Form form={form} layout="vertical">
          {/* 基本信息 */}
          <Divider orientation="left" style={{ margin: "16px 0 12px" }}>基本信息</Divider>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="code" label="商品编码" rules={[{ required: true }]}>
                <Input placeholder="如: SKU-001" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="name" label="商品名称" rules={[{ required: true }]}>
                <Input placeholder="请输入商品名称" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="unitId" label="单位" rules={[{ required: true }]}>
                <Select value={selectedLocationId || undefined} onChange={(val) => setSelectedLocationId(val)} placeholder="选择单位">{units.map(u => <Option key={u.code} value={u.id}>{u.name}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="barcode" label="条码">
                <Input placeholder="商品条码" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="categoryId" label="分类">
                <Select allowClear placeholder="选择分类">{categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}</Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="costMethod" label="成本方法">
                <Select placeholder="选择成本方法">
                  <Option value="WEIGHTED">移动加权</Option>
                  <Option value="FIFO">先进先出</Option>
                  <Option value="MONTHLY">月度加权</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 库存设置 */}
          <Divider orientation="left" style={{ margin: "16px 0 12px" }}>库存设置</Divider>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="safetyStock" label="安全库存">
                <InputNumber style={{ width: "100%" }} min={0} placeholder="最低库存预警值" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="maxStock" label="最大库存">
                <InputNumber style={{ width: "100%" }} min={0} placeholder="最大库存上限" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="status" label="状态" initialValue={1}>
                <Select>
                  <Option value={1}>启用</Option>
                  <Option value={0}>停用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 仓库库位设置 - 仅新建时显示 */}
          {!editId && (
            <>
              <Divider orientation="left" style={{ margin: "16px 0 12px" }}>
                <Space><HomeOutlined /> 仓库库位设置</Space>
              </Divider>
              
              

              <Row gutter={isMobile ? 8 : 16}>
                <Col span={isMobile ? 24 : 6}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>所属仓库 <span style={{ color: "#ff4d4f" }}>*</span></div>
                    <Select
                      style={{ width: "100%" }}
                      placeholder="选择仓库"
                      popupMatchSelectWidth={false}
                      value={selectedWarehouseId || undefined}
                      onChange={(val) => {
                        setSelectedWarehouseId(val);
                        setLocationCodeInput("");
                      }}
                    >
                      {warehouses.map((w: any) => <Option key={w.id} value={String(w.id)}>{w.name}</Option>)}
                    </Select>
                  </div>
                </Col>
                <Col span={isMobile ? 24 : 6}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>存放货位 <span style={{ color: "#ff4d4f" }}>*</span></div>
                    <Input
                      style={{ width: "100%" }}
                      placeholder="输入货位编码 如 A-1-1-1"
                      value={locationCodeInput}
                      onChange={(e) => setLocationCodeInput(e.target.value.toUpperCase())}
                    />
                  </div>
                </Col>
                <Col span={isMobile ? 24 : 6}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>初始库存数量 <span style={{ color: "#ff4d4f" }}>*</span></div>
                    <InputNumber style={{ width: "100%" }} min={1} placeholder="入库数量" value={initialStockVal || undefined} onChange={(v) => setInitialStockVal(v || 0)} />
                  </div>
                </Col>
                <Col span={isMobile ? 24 : 6}>
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>初始成本单价</div>
                    <InputNumber style={{ width: "100%" }} min={0} precision={2} placeholder="¥ 单价" prefix="¥" value={initialCostVal || undefined} onChange={(v) => setInitialCostVal(v || 0)} />
                  </div>
                </Col>
              </Row>



              
            </>
          )}

          {/* 商品主图 */}
          <Divider orientation="left" style={{ margin: "16px 0 12px" }}>商品主图（可选）</Divider>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item label="上传图片">
                <Upload
                  name="file"
                  action="/api/upload"
                  maxCount={1}
                  listType="picture-card"
                  accept="image/*"
                  fileList={fileList}
                  beforeUpload={(file) => {
                    const isImage = file.type.startsWith('image/');
                    if (!isImage) { message.error('只能上传图片'); }
                    const isLt5M = file.size / 1024 / 1024 < 5;
                    if (!isLt5M) { message.error('图片不能超过5MB'); }
                    return isImage && isLt5M;
                  }}
                  onChange={({ fileList: newFileList }) => {
                    setFileList(newFileList);
                    const lastFile = newFileList[newFileList.length - 1];
                    if (lastFile?.status === 'done') {
                      const url = lastFile.response?.url;
                      if (url) {
                        setImageUrl(url);
                        message.success('图片上传成功');
                      }
                    } else if (lastFile?.status === 'error') {
                      message.error('图片上传失败');
                    }
                  }}
                  onRemove={() => { setImageUrl(''); setFileList([]); }}
                >
                  {fileList.length >= 1 ? null : (
                    <div>
                      <PlusOutlined />
                      <div style={{ marginTop: 8 }}>{imageUrl ? '更换' : '上传'}</div>
                    </div>
                  )}
                </Upload>
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: "16px 0 12px" }}>商品配置（可选）</Divider>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="spec" label="规格">
                <Input placeholder="如: 500ml/瓶" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="brand" label="品牌">
                <Input placeholder="品牌名称" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="model" label="型号">
                <Input placeholder="产品型号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="weight" label="重量">
                <InputNumber style={{ width: "100%" }} min={0} precision={3} placeholder="千克" addonAfter="kg" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="volume" label="体积">
                <InputNumber style={{ width: "100%" }} min={0} precision={4} placeholder="立方米" addonAfter="m³" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="defaultCost" label="默认成本">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} placeholder="¥" prefix="¥" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="salePrice" label="销售价">
                <InputNumber style={{ width: "100%" }} min={0} precision={2} placeholder="¥" prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="shelfLifeDays" label="保质期">
                <InputNumber style={{ width: "100%" }} min={0} placeholder="天数" addonAfter="天" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 8}>
              <Form.Item name="leadTimeDays" label="采购周期">
                <InputNumber style={{ width: "100%" }} min={0} placeholder="天数" addonAfter="天" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" style={{ margin: "16px 0 12px" }}>其他信息</Divider>
          <Form.Item name="remark" label="描述">
            <Input.TextArea rows={2} placeholder="商品描述、规格说明等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 分类管理弹窗 */}
      <Modal title="分类管理" open={categoryModalOpen} onCancel={() => setCategoryModalOpen(false)} footer={null} width={isMobile ? "95%" : 600}>
        <Form form={catForm} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item name="name" rules={[{ required: true }]}>
            <Input placeholder="分类名称" />
          </Form.Item>
          <Form.Item name="code" rules={[{ required: true }]}>
            <Input placeholder="分类编码" />
          </Form.Item>
          <Form.Item name="parentId">
            <Select allowClear placeholder="上级分类" style={{ width: 120 }}>
              {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleCreateCategory}>添加</Button>
          </Form.Item>
        </Form>
        <List
          bordered
          dataSource={categories}
          renderItem={(item: any) => (
            <List.Item
              actions={[
                <Popconfirm key="del" title="确定删除此分类？" onConfirm={() => handleDeleteCategory(item.id)} okText="确定" cancelText="取消">
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                title={item.name}
                description={`编码: ${item.code}`}
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* 单位管理弹窗 */}
      <Modal title="单位管理" open={unitModalOpen} onCancel={() => setUnitModalOpen(false)} footer={null} width={isMobile ? "95%" : 500}>
        <div style={{ marginBottom: 16 }}>

        </div>
        <Form form={unitForm} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item name="name" rules={[{ required: true }]}>
            <Input placeholder="单位名称" />
          </Form.Item>
          <Form.Item name="code" rules={[{ required: true }]}>
            <Input placeholder="单位编码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleCreateUnit}>添加</Button>
          </Form.Item>
        </Form>
        <List
          bordered
          dataSource={units}
          renderItem={(item: any) => (
            <List.Item
              actions={[
                <Popconfirm key="del" title="确定删除此单位？" onConfirm={() => handleDeleteUnit(item.id)} okText="确定" cancelText="取消">
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                title={item.name}
                description={`编码: ${item.code}`}
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* 商品详情 - 含价格历史 */}
      <Drawer title="商品详情" open={detailOpen} onClose={() => { setDetailOpen(false); setPriceHistory(null); }} width={isMobile ? "100%" : 720}>
        {selectedProduct && (
          <Tabs defaultActiveKey="info" items={[
            {
              key: "info",
              label: "基本信息",
              children: (
                <>
                  <Descriptions column={isMobile ? 1 : 2} bordered size="small">
                    <Descriptions.Item label="编码">{selectedProduct.code}</Descriptions.Item>
                    <Descriptions.Item label="名称">{selectedProduct.name}</Descriptions.Item>
                    <Descriptions.Item label="条码">{selectedProduct.barcode || "-"}</Descriptions.Item>
                    <Descriptions.Item label="分类">{selectedProduct.category?.name || "-"}</Descriptions.Item>
                    <Descriptions.Item label="单位">{selectedProduct.unit?.name || selectedProduct.unit || "-"}</Descriptions.Item>
                    <Descriptions.Item label="状态"><Tag color={selectedProduct.status === 1 ? "green" : "red"}>{selectedProduct.status === 1 ? "启用" : "停用"}</Tag></Descriptions.Item>
                    <Descriptions.Item label="安全库存">{selectedProduct.safetyStock || 0}</Descriptions.Item>
                    <Descriptions.Item label="最大库存">{selectedProduct.maxStock || 0}</Descriptions.Item>
                    <Descriptions.Item label="描述" span={isMobile ? 1 : 2}>{selectedProduct.remark || selectedProduct.description || "-"}</Descriptions.Item>
                  </Descriptions>

                  {/* 显示库存分布 */}
                  {selectedProduct.inventories && selectedProduct.inventories.length > 0 && (
                    <>
                      <Title level={5} style={{ marginTop: 16 }}><HomeOutlined /> 库存分布</Title>
                      <Table
                        size="small"
                        pagination={false}
                        dataSource={selectedProduct.inventories}
                        rowKey="id"
                        columns={[
                          { title: "仓库", dataIndex: ["warehouse", "name"], key: "warehouse", render: (_: any, r: any) => r.warehouse?.name || "-" },
                          { title: "在手量", dataIndex: "onHand", key: "onHand", render: (v: any) => <Text strong>{Number(v || 0)}</Text> },
                          { title: "锁定量", dataIndex: "locked", key: "locked", render: (v: any) => Number(v || 0) },
                          { title: "可用量", dataIndex: "available", key: "available", render: (v: any) => <Text type="success">{Number(v || 0)}</Text> },
                        ]}
                      />
                    </>
                  )}
                </>
              ),
            },
            {
              key: "price",
              label: <><DollarOutlined /> 价格历史</>,
              children: (
                <div>
                  {priceHistory && (
                    <>
                      <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="当前成本">
                          <Text strong style={{ color: "#1890ff" }}>¥{Number(priceHistory.currentCost || 0).toFixed(2)}</Text>
                        </Descriptions.Item>
                        <Descriptions.Item label="最新入库价">
                          <Text strong style={{ color: "#52c41a" }}>¥{Number(priceHistory.lastInboundPrice || 0).toFixed(2)}</Text>
                        </Descriptions.Item>
                      </Descriptions>
                      <Table
                        columns={priceHistoryColumns}
                        dataSource={priceHistory.records || []}
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: 10 }}
                        loading={priceLoading}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ]} />
        )}
      </Drawer>
    </div>
  );
}
