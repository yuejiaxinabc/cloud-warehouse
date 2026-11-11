"use client";
import { fetchAllPages } from '@/lib/fetch-all-pages';

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, Table, Button, Space, Input, Select, Tag, Row, Col, Modal, Form, message, Typography, Descriptions, InputNumber, Alert, DatePicker } from "antd";
import { useRouter } from "next/navigation";
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, ScanOutlined, PrinterOutlined, EyeOutlined, CameraOutlined } from "@ant-design/icons";
import dynamic from "next/dynamic";
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), { ssr: false });
// L4：状态展示统一走 StatusBadge（中文映射唯一出口）
import { OrderStatusBadge } from "@/components/ui/StatusBadge";

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
      // v1.2.1（P2-7）：必须带 limit。后端新默认分页只回 200 条，仓库货位 2600+ 会漏；
      // limit=2000 只是当前折中，后续应改成按编码服务端搜索（v1.2.1 先不发散）。
      // 注意不能加 empty=1：本页要显示被同商品占用的货位用于补货。
      const res = await fetch(`/api/warehouse/locations?warehouseId=${warehouseId}&limit=2000`, { cache: 'no-store' });
      const j = await res.json();
      if (j.success) setLocations(j.data || []);
    } catch { setLocations([]); }
  };
  /**
   * v1.2.1（P2-7）：货位能否选要看「本行商品是不是占用它的那个商品」
   * 同一商品补货继续用原货位是允许的（后端 assertLocationAvailableFor 同样放行），
   * 之前一律 disabled: !!l.occupiedBy，补货只能另开新货位。
   * 判定按 productId 是否相等，不用商品名文本比较（改名/同名商品会误判）。
   */
  const toLocationOption = (l: any, productId?: any) => {
    const occ = l.occupiedBy;
    const sameProduct = !!occ && productId !== undefined && productId !== null && String(occ.productId) === String(productId);
    const label = occ
      ? l.code + (sameProduct
          ? `（本商品已存放：${occ.productName}，可继续补货）`
          : `（已放：${occ.productName}，不可混放）`)
      : l.code + '（空）';
    return { value: l.id, label, disabled: !!occ && !sameProduct };
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
  // v1.2.1（P2-7）：手动创建是「一单多行商品」，货位可用性要逐行判断，故监听明细数组
  const createItems = Form.useWatch<any[]>('items', form);
  const [isMobile, setIsMobile] = useState(false);
  // F4：过账确认框单例锁 + 按钮 loading，双击不会再叠出第二个确认框
  const confirmLockRef = useRef(false);
  const [postingId, setPostingId] = useState<number | null>(null);

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
      const items = await fetchAllPages("/api/products");
      setProducts(items);
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
          const hits = await fetchAllPages("/api/products?keyword=" + encodeURIComponent(barcode));
          if (hits.length > 0) {
            found = hits.find((p: any) => 
              p.barcode === barcode || p.code === barcode || String(p.id) === barcode
            ) || hits[0];
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

  // 摄像头回调必须身份稳定：BarcodeScanner 的启动 effect 依赖 onScan，
  // 此前每次父组件渲染都生成新回调，导致摄像头反复 stop/重启动、一直卡在“正在启动摄像头…”
  const handleScanRef = useRef(handleScan);
  handleScanRef.current = handleScan;
  const handleCameraScan = useCallback((code: string) => {
    setShowCamera(false);
    handleScanRef.current(code);
  }, []);

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

  // L4：不再在本页单独维护状态映射（旧映射缺项时会把 DRAFT/POSTED 等英文码直接渲染出去）
  const getStatusTag = (status: string) => <OrderStatusBadge status={status} />;

  /**
   * F4 修复：过账确认框改成单例防重入。
   * 第一次点击立刻把 confirmLockRef 置位，第二次点击直接 return，
   * 不会再叠出第二个 Modal.confirm（旧版两个遮罩互相挡住，只能刷新页面）。
   * 关闭确认框（确认/取消/点遮罩）后才在 afterClose 解锁。
   */
  const handlePost = (id: number) => {
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    setPostingId(id);
    Modal.confirm({
      title: "确认过账",
      content: "过账后将更新库存，确定要过账吗？",
      okText: "确认过账",
      cancelText: "取消",
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
        } finally {
          setPostingId(null);
        }
      },
      onCancel: () => setPostingId(null),
      afterClose: () => { confirmLockRef.current = false; },
    });
  };

  const columns = [
    { title: "入库单号", dataIndex: "orderNo", key: "orderNo", width: isMobile ? 140 : 180, render: (t: string) => <span style={{ fontFamily: "monospace", fontWeight: 500, color: "#1976D2" }}>{t}</span> },
    ...(!isMobile ? [
      { title: "类型", dataIndex: "type", key: "type", width: 100, render: (t: string) => <Tag>{t === "PURCHASE" ? "采购入库" : t === "RETURN" ? "退货入库" : t === "PRODUCTION" ? "生产入库" : "其他入库"}</Tag> },
      { title: "仓库", dataIndex: ["warehouse", "name"], key: "warehouse", width: 120, render: (_: any, r: any) => r.warehouse?.name || "-" },
      { title: "供应商", dataIndex: ["supplier", "name"], key: "supplier", width: 150, render: (_: any, r: any) => r.supplier?.name || "-" },
    ] : []),
    // F10：窄屏下表格横向滚动时「状态」列会滑出可视区，这里固定在右侧，
    // 保证 375px/平板宽度下也能看到单据状态并判断能否过账
    { title: "状态", dataIndex: "status", key: "status", width: isMobile ? 76 : 100, fixed: isMobile ? ("right" as const) : undefined, render: (s: string) => getStatusTag(s) },
    ...(!isMobile ? [
      { title: "商品数", key: "itemCount", width: 80, render: (_: any, r: any) => r.inboundItems?.length || 0 },
      { title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 160, render: (d: string) => d ? new Date(d).toLocaleString("zh-CN") : "-" },
    ] : []),
    {
      title: "操作", key: "action", width: isMobile ? 84 : 180, fixed: "right" as const,
      render: (_: any, record: any) => (
        <Space size={isMobile ? 0 : 4}>
          <Button type="link" size="small" icon={<EyeOutlined />} title={isMobile ? "查看" : undefined} aria-label="查看" onClick={() => router.push(`/stock-in/${record.id}`)}>{isMobile ? "" : "查看"}</Button>
          {/* F3+L5：只有草稿才渲染「过账」；已过账/已取消只给详情，
              不再出现点了才被服务端拒绝（当前状态"POSTED"不允许执行"过账"操作） */}
          {record.status === "DRAFT" && (
            <Button type="link" size="small" icon={<CheckCircleOutlined />}
              title={isMobile ? "过账" : undefined}
              aria-label="过账"
              loading={postingId === record.id}
              disabled={postingId === record.id}
              onClick={() => handlePost(record.id)}>{isMobile ? "" : "过账"}</Button>
          )}
          {/* 移动端保留过账入口，用户不用切到桌面端也能过账 */}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>扫码入库</h4>

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
      {/* L6：destroyOnClose 让关闭的弹窗从 DOM 卸载，避免扫码弹窗与创建弹窗同时挂载出现两个 id="warehouseId" */}
      <Modal title="扫码入库" open={scanModalOpen} destroyOnClose onCancel={() => { setScanModalOpen(false); setShowCamera(false); setScanResult(null); scanForm.resetFields(); }} width={isMobile ? "95%" : 600}
        footer={[
          <Button key="cancel" onClick={() => { setScanModalOpen(false); setScanResult(null); }}>取消</Button>,
          <Button key="submit" type="primary" onClick={handleScanSubmit}>确认入库</Button>,
        ]}>
        <Form form={scanForm} layout="vertical">
          {/* L6：无 name 的 Form.Item 手写 htmlFor，与下面输入框 id 对应（label 不再脱离控件） */}
          <Form.Item label="扫码识别" htmlFor="stockInScanCode">
            {showCamera && (
              <div style={{ marginBottom: 12 }}>
                <BarcodeScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
                <Button block style={{ marginTop: 8 }} onClick={() => setShowCamera(false)}>关闭摄像头，改用手动输入</Button>
              </div>
            )}
            {/* 手动输入框始终可见：摄像头启动失败、无摄像头或一直“正在启动”时，可直接在此输入条码 */}
            <div style={{ display: "flex", gap: 8 }}>
              {!showCamera && (
                <Button icon={<CameraOutlined />} size="large" onClick={() => setShowCamera(true)} style={{ flexShrink: 0 }}>
                  扫码
                </Button>
              )}
              <Input.Search id="stockInScanCode" ref={scanInputRef} placeholder="手动输入条码/SKU" size="large" onSearch={handleScan} loading={scanLoading} style={{ flex: 1 }} autoFocus allowClear />
            </div>
            {showCamera && <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>摄像头无法启动时，可直接在上方输入框手动输入条码后回车查询</div>}
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
                  options={locations
                    .filter((l: any) => l.status === 1)
                    .map((l: any) => toLocationOption(l, scanResult?.id))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 手动创建弹窗 */}
      {/* L6：同样 destroyOnClose，保证同一时刻 DOM 里只有一份表单 id（warehouseId/locationId 不重复） */}
      <Modal title="手动创建入库单" open={createModalOpen} destroyOnClose onCancel={() => { setCreateModalOpen(false); form.resetFields(); }} width={isMobile ? "95%" : 640} onOk={handleCreate}>
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
                              .map((l: any) => toLocationOption(l, createItems?.[name]?.productId))}
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
      <Modal title="快速添加商品" open={quickAddOpen} destroyOnClose onCancel={() => setQuickAddOpen(false)} footer={null} width={isMobile ? "95%" : 480}>
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
