"use client";

import React, { useState, useRef, useEffect } from "react";
import { Card, Table, Button, Space, Input, Select, Tag, Row, Col, Modal, Form, message, Typography, Descriptions, InputNumber, Alert, DatePicker } from "antd";
import { useRouter } from "next/navigation";
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, ScanOutlined, PrinterOutlined, EyeOutlined, CameraOutlined } from "@ant-design/icons";
import dynamic from "next/dynamic";
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), { ssr: false });

const { Title, Text } = Typography;
const { Option } = Select;

export default function StockInPage() {
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  // FIX-2026-1019：入库明细必须选货位才能过账，这里加载当前仓库的可用货位
  const [locations, setLocations] = useState<any[]>([]);
  const loadLocations = async (warehouseId?: number) => {
    if (!warehouseId) { setLocations([]); return; }
    try {
      const res = await fetch(`/api/warehouse/locations?warehouseId=${warehouseId}`, { cache: 'no-store' });
      const j = await res.json();
      if (j.success) setLocations(j.data || []);
    } catch { setLocations([]); }
  };
  const [showCamera, setShowCamera] = useState(false);
  const scanInputRef = useRef<any>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState("");
  const [quickAddForm] = Form.useForm();
  const [scanLoading, setScanLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [form] = Form.useForm();
  const [scanForm] = Form.useForm();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { loadOrders(); }, [keyword, statusFilter, page]);
  useEffect(() => { loadProducts(); loadWarehouses(); }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set("keyword", keyword);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", "15");
      const res = await fetch(`/api/stock-in?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setOrders(data.data?.items || []);
        setTotal(data.data?.total || 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/products?pageSize=1000");
      const data = await res.json();
      if (data.success) setProducts(data.data?.items || []);
    } catch (e) { console.error(e); }
  };

  const loadWarehouses = async () => {
    try {
      const res = await fetch("/api/warehouse");
      const supRes = await fetch("/api/suppliers?pageSize=50");
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchProductPrice = async (productId: number) => {
    try {
      const res = await fetch(`/api/products/${productId}/price`);
      const data = await res.json();
      if (data.success && data.data.price > 0) {
        return data.data.price;
      }
    } catch (e) { console.error(e); }
    return 0;
  };

  const handleScan = async (barcode: string) => {
    if (!barcode.trim()) return;
    setScanLoading(true);
    try {
      // 先查本地列表（条码、编码、ID都匹配）
      let found = products.find((p: any) => 
        p.barcode === barcode || p.code === barcode || String(p.id) === barcode
      );
      // 本地没找到，查API
      if (!found) {
        try {
          const res = await fetch("/api/products?pageSize=1000&keyword=" + encodeURIComponent(barcode));
          const data = await res.json();
          if (data.success && data.data?.items?.length > 0) {
            found = data.data.items.find((p: any) => 
              p.barcode === barcode || p.code === barcode || String(p.id) === barcode
            ) || data.data.items[0];
          }
        } catch {}
      }
      if (found) {
        setScanResult(found);
        const price = await fetchProductPrice(found.id);
        scanForm.setFieldsValue({ productId: found.id, unitPrice: price });
        message.success({ content: `识别成功: ${found.name}（${found.code}）价格: ${price}`, duration: 3 });
      } else {
        setScanResult(null);
        setQuickAddBarcode(barcode);
        setQuickAddOpen(true);
        setTimeout(() => quickAddForm.setFieldsValue({ barcode, code: barcode }), 100);
        message.warning("未找到商品，可快速添加");
      }
    } catch (e) { message.error("扫码失败"); }
    setScanLoading(false);
  };

  const handleCameraScan = (code: string) => {
    setShowCamera(false);
    handleScan(code);
  };

  const handleScanSubmit = async () => {
    try {
      if (!scanResult) { message.warning("请先扫码识别商品"); return; }
      const values = await scanForm.validateFields();
      const res = await fetch("/api/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "purchase",
          warehouseId: values.warehouseId,
          supplierId: values.supplierId || null,
          items: [{
            productId: scanResult.id,
            planQty: values.quantity,
            unitPrice: values.unitPrice,
            locationId: values.locationId,
            batchNo: values.batchNo || null,
            producedAt: values.producedAt ? values.producedAt.toISOString() : null,
          }],
        }),
      });
      const data = await res.json();
      if (data.success) {
        message.success("入库单创建成功");
        setScanModalOpen(false);
        setScanResult(null);
        scanForm.resetFields();
        loadOrders();
      } else {
        message.error(data.error || "创建失败");
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error("创建失败");
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await fetch("/api/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        message.success("入库单创建成功");
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

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      DRAFT: { color: "default", text: "草稿" },
      POSTED: { color: "success", text: "已过账" },
      CANCELLED: { color: "error", text: "已取消" },
    };
    const s = statusMap[status] || { color: "default", text: status };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  const handlePost = async (id: number) => {
    Modal.confirm({
      title: "确认过账",
      content: "过账后将更新库存，确定要过账吗？",
      onOk: async () => {
        try {
          const res = await fetch(`/api/stock-in/${id}/post`, { method: "POST" });
          const data = await res.json();
          if (data.success) {
            message.success("过账成功");
            loadOrders();
          } else {
            message.error(data.error || data.message || "过账失败");
          }
        } catch (e) {
          message.error("过账失败");
        }
      },
    });
  };

  const columns = [
    { title: "入库单号", dataIndex: "orderNo", key: "orderNo", width: isMobile ? 140 : 180, render: (t: string) => <span style={{ fontFamily: "monospace", fontWeight: 500, color: "#1976D2" }}>{t}</span> },
    ...(!isMobile ? [
      { title: "类型", dataIndex: "type", key: "type", width: 100, render: (t: string) => <Tag>{t === "PURCHASE" ? "采购入库" : t === "RETURN" ? "退货入库" : t === "PRODUCTION" ? "生产入库" : "其他入库"}</Tag> },
      { title: "仓库", dataIndex: ["warehouse", "name"], key: "warehouse", width: 120, render: (_: any, r: any) => r.warehouse?.name || "-" },
      { title: "供应商", dataIndex: ["supplier", "name"], key: "supplier", width: 150, render: (_: any, r: any) => r.supplier?.name || "-" },
    ] : []),
    { title: "状态", dataIndex: "status", key: "status", width: isMobile ? 80 : 100, render: (s: string) => getStatusTag(s) },
    ...(!isMobile ? [
      { title: "商品数", key: "itemCount", width: 80, render: (_: any, r: any) => r.inboundItems?.length || 0 },
      { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 160, render: (d: string) => d ? new Date(d).toLocaleString("zh-CN") : "-" },
    ] : []),
    {
      title: "操作", key: "action", width: isMobile ? 80 : 180, fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space size={isMobile ? 0 : 4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => router.push(`/stock-in/${record.id}`)}>{isMobile ? "" : "查看"}</Button>
          {!isMobile && <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handlePost(record.id)}>过账</Button>}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>入库管理</h4>

      {!isMobile && (
        <Alert message="入库说明" description="扫描商品条码自动识别，只有已添加的商品才能扫码入库。支持手动创建入库单。" type="info" showIcon style={{ marginBottom: 16 }} />
      )}

      <Card>
        <div style={{ 
          display: "flex", 
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "space-between", 
          marginBottom: 16,
          gap: isMobile ? 12 : 0
        }}>
          <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: isMobile ? "100%" : "auto" }}>
            <Input prefix={<SearchOutlined />} placeholder="搜索入库单号" style={{ width: isMobile ? "100%" : 240 }} allowClear onChange={(e) => setKeyword(e.target.value)} />
            <Select placeholder="状态筛选" allowClear style={{ width: isMobile ? "100%" : 120 }} onChange={(v) => setStatusFilter(v)}>
              <Option value="DRAFT">草稿</Option>
              <Option value="POSTED">已过账</Option>
              <Option value="CANCELLED">已取消</Option>
            </Select>
          </Space>
          <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: isMobile ? "100%" : "auto" }}>
            <Button
              icon={<ScanOutlined />}
              onClick={() => {
                setScanModalOpen(true);
                // FIX-2026-1016：点扫码直接拉起摄像头，不再需要二次点击「打开摄像头」
                setShowCamera(true);
                setTimeout(() => scanInputRef.current?.focus(), 300);
              }}
              block={isMobile}
            >扫码入库</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }} block={isMobile}>手动创建</Button>
          </Space>
        </div>
        <Table columns={columns} dataSource={orders} rowKey="id" loading={loading} scroll={{ x: isMobile ? 400 : 1000 }} pagination={{ current: page, total, pageSize: 15, onChange: setPage, showTotal: (t) => `共 ${t} 条`, size: isMobile ? "small" : "default" }} size={isMobile ? "small" : "middle"} />
      </Card>

      {/* 扫码入库弹窗 */}
      <Modal title="扫码入库" open={scanModalOpen} onCancel={() => { setScanModalOpen(false); setShowCamera(false); setScanResult(null); scanForm.resetFields(); }} width={isMobile ? "95%" : 600}
        footer={[
          <Button key="cancel" onClick={() => { setScanModalOpen(false); setScanResult(null); }}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleScanSubmit}>确认入库</Button>,
        ]}>
        <Form form={scanForm} layout="vertical">
          <Form.Item label="扫码识别">
            {showCamera ? (
              <div style={{ marginBottom: 12 }}>
                <BarcodeScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
                <Button block style={{ marginTop: 8 }} onClick={() => setShowCamera(false)}>关闭摄像头</Button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                {isMobile && (
                  <Button icon={<CameraOutlined />} size="large" onClick={() => setShowCamera(true)} style={{ flexShrink: 0 }}>
                    扫码
                  </Button>
                )}
                <Input.Search ref={scanInputRef} placeholder="手动输入条码/SKU" size="large" onSearch={handleScan} loading={scanLoading} style={{ flex: 1 }} autoFocus allowClear />
              </div>
            )}
          </Form.Item>
          {scanResult && (
            <Alert type="success" showIcon style={{ marginBottom: 16 }}
              message={`商品: ${scanResult.name} (${scanResult.code})`}
              description={`规格: ${scanResult.spec || "-"} | 品牌: ${scanResult.brand || "-"}`} />
          )}
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true, message: "请选择仓库" }]}
                extra="切换仓库后会重新加载该仓库的货位">
                <Select
                  placeholder="选择仓库"
                  onChange={(v) => {
                    loadLocations(v);
                    // 换仓库后旧货位失效，清掉明细里的选择
                    const items = form.getFieldValue('items') || [];
                    form.setFieldsValue({ items: items.map((it: any) => ({ ...it, locationId: undefined })) });
                  }}
                >
                  {warehouses.map((w: any) => <Option key={w.id} value={w.id}>{w.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="supplierId" label="供应商">
                <Select placeholder="选择供应商" allowClear showSearch filterOption={(input, option) => (option?.children?.toString() || '').toLowerCase().includes(input.toLowerCase())}>
                  {suppliers.map((s: any) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="quantity" label="入库数量" rules={[{ required: true, message: "请输入数量" }]}>
                <InputNumber min={1} placeholder="数量" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="unitPrice" label="单价">
                <InputNumber min={0} precision={2} placeholder="单价" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item
                name="batchNo"
                label="批次号"
                rules={scanResult?.shelfLifeDays ? [{ required: true, message: "该商品有保质期，批次号必填" }] : []}
                extra={scanResult?.shelfLifeDays ? `该商品保质期 ${scanResult.shelfLifeDays} 天，到期日按生产日期自动推算` : "有保质期的商品必填"}
              >
                <Input placeholder="如 LOT-20261028-001" allowClear />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item
                name="producedAt"
                label="生产日期"
                rules={scanResult?.shelfLifeDays ? [{ required: true, message: "该商品有保质期，生产日期必填" }] : []}
              >
                <DatePicker style={{ width: "100%" }} placeholder="选择生产日期" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={24}>
              {/* FIX-2026-1019：入库必须指定货位，否则过账会被拒绝 */}
              <Form.Item
                name="locationId"
                label="放置货位"
                rules={[{ required: true, message: "请选择货位" }]}
                extra="必填。决定这批货落到哪个货架位，可在货架地图查看货位编码"
              >
                <Select
                  placeholder="选择货位"
                  showSearch
                  optionFilterProp="label"
                  notFoundContent="该仓库暂无可用货位"
                  options={locations.filter((l: any) => l.status === 1).map((l: any) => ({
                    value: l.id,
                    label: l.code + (l.occupiedBy ? `（已放：${l.occupiedBy.productName}）` : '（空）'),
                    disabled: !!l.occupiedBy,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 手动创建弹窗 */}
      <Modal title="手动创建入库单" open={createModalOpen} onCancel={() => { setCreateModalOpen(false); form.resetFields(); }} width={isMobile ? "95%" : 640} onOk={handleCreate}>
        <Form form={form} layout="vertical">
          <Row gutter={isMobile ? 8 : 16}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="type" label="入库类型" rules={[{ required: true }]}>
                <Select>
                  <Option value="purchase">采购入库</Option>
                  <Option value="return">退货入库</Option>
                  <Option value="production">生产入库</Option>
                  <Option value="other">其他入库</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="warehouseId" label="入库仓库" rules={[{ required: true }]}>
                <Select placeholder="选择仓库">
                  {warehouses.map((w: any) => <Option key={w.id} value={w.id}>{w.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item label="入库商品" required>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row key={key} gutter={isMobile ? 8 : 16} style={{ marginBottom: 8 }}>
                      <Col span={isMobile ? 24 : 10}>
                        <Form.Item {...restField} name={[name, "productId"]} rules={[{ required: true, message: "请选择商品" }]}>
                          <Select 
                            placeholder="输入编码/名称搜索商品" 
                            showSearch 
                            filterOption={(input, option) => {
                              const label = option?.label?.toString() || '';
                              return label.toLowerCase().includes(input.toLowerCase());
                            }}
                            onChange={(val) => {
                              fetchProductPrice(val).then(price => {
                                if (price > 0) {
                                  const items = form.getFieldValue('items') || [];
                                  items[name] = { ...items[name], unitPrice: price };
                                  form.setFieldsValue({ items });
                                }
                              });
                            }}
                            options={products.map((p: any) => ({ value: p.id, label: p.code + ' - ' + p.name }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={isMobile ? 12 : 5}>
                        <Form.Item {...restField} name={[name, "planQty"]} rules={[{ required: true, message: "请输入数量" }]}>
                          <InputNumber min={1} placeholder="数量" style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col span={isMobile ? 12 : 5}>
                        <Form.Item
                          {...restField}
                          name={[name, "locationId"]}
                          rules={[{ required: true, message: "请选择货位" }]}
                        >
                          <Select
                            placeholder="货位（必填）"
                            showSearch
                            optionFilterProp="label"
                            // FIX-2026-1020：展开时按当前仓库兜底加载，
                            // 避免没触发过仓库 onChange 时下拉为空
                            onDropdownVisibleChange={(open) => {
                              if (open && locations.length === 0) {
                                loadLocations(form.getFieldValue('warehouseId'));
                              }
                            }}
                            notFoundContent="该仓库暂无可用货位"
                            options={locations
                              .filter((l: any) => l.status === 1)
                              .map((l: any) => ({
                                value: l.id,
                                label: l.code + (l.occupiedBy ? `（已放：${l.occupiedBy.productName}）` : '（空）'),
                                disabled: !!l.occupiedBy,
                              }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={isMobile ? 8 : 4}>
                        <Form.Item {...restField} name={[name, "unitPrice"]}>
                          <InputNumber min={0} precision={2} placeholder="单价" style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col span={isMobile ? 2 : 2}>
                        <Button type="link" danger onClick={() => remove(name)}>删除</Button>
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>添加商品</Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>
    
      {/* 快速添加商品弹窗 */}
      <Modal title="快速添加商品" open={quickAddOpen} onCancel={() => setQuickAddOpen(false)} footer={null} width={isMobile ? "95%" : 480}>
        <Form form={quickAddForm} layout="vertical" onFinish={async (values) => {
          try {
            const res = await fetch("/api/products", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...values, status: 1 }),
            });
            const data = await res.json();
            if (data.success) {
              message.success("商品添加成功");
              setQuickAddOpen(false);
              loadProducts();
              // 自动回填到扫码表单
              const newId = data.data?.id;
              if (newId) {
                setScanResult({ id: newId, name: values.name, code: values.code, barcode: values.barcode });
                scanForm.setFieldsValue({ productId: newId, unitPrice: values.price || 0 });
              }
            } else {
              message.error(data.error || "添加失败");
            }
          } catch (e) { message.error("添加失败"); }
        }}>
          <Form.Item label="条码" name="barcode">
            <Input disabled />
          </Form.Item>
          <Form.Item label="商品名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="输入商品名称" />
          </Form.Item>
          <Form.Item label="商品编码" name="code" rules={[{ required: true }]}>
            <Input placeholder="输入商品编码" />
          </Form.Item>
          <Form.Item label="单位" name="unit" initialValue="个">
            <Input placeholder="个/箱/件" />
          </Form.Item>
          <Form.Item label="参考单价" name="price">
            <Input type="number" placeholder="输入单价（可选）" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>确认添加</Button>
        </Form>
      </Modal>
</div>
  );
}
