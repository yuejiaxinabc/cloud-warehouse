'use client';
import { fetchAllPages } from '@/lib/fetch-all-pages';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Button, Space, Input, Select, Tag, Row, Col, Modal, Form, message, Typography, InputNumber } from 'antd';
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, ScanOutlined, EyeOutlined, ReloadOutlined, CameraOutlined } from '@ant-design/icons';
import dynamic from "next/dynamic";
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), { ssr: false });
import { useRouter } from 'next/navigation';
// L4：状态展示统一走 StatusBadge（中文映射唯一出口）
import { OrderStatusBadge } from '@/components/ui/StatusBadge';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export default function StockOutPage() {
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const scanInputRef = useRef<any>(null);
  const [scanResult, setScanResult] = useState<any>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState("");
  const [scanLoading, setScanLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [loading, setLoading] = useState(false);
  // F4：过账确认框单例锁 + 按钮 loading，双击不会再叠出第二个确认框
  const confirmLockRef = useRef(false);
  const [postingId, setPostingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [scanForm] = Form.useForm();
  // 明细实时快照：数量/单价一改，行小计与合计立刻跟着变（原来要提交后才算出金额）
  const itemsWatch = Form.useWatch('items', form) as Array<{ quantity?: number; unitPrice?: number }> | undefined;
  const formTotals = useMemo(() => {
    const rows = Array.isArray(itemsWatch) ? itemsWatch : [];
    let qty = 0;
    let amount = 0;
    for (const r of rows) {
      const q = Number(r?.quantity) || 0;
      const p = Number(r?.unitPrice) || 0;
      qty += q;
      amount += q * p;
    }
    return { qty, amount };
  }, [itemsWatch]);
  const router = useRouter();

  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    loadOrders();
    loadProducts();
    loadWarehouses();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/stock-out?${params}`);
      const data = await res.json();
      if (data.success) setOrders(data.data?.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const loadProducts = async () => {
    try {
      const items = await fetchAllPages('/api/products');
      setProducts(items);
    } catch (e) { console.error(e); }
  };

  const loadWarehouses = async () => {
    try {
      const res = await fetch('/api/warehouse');
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch (e) { console.error(e); }
  };

  const fetchProductPrice = async (productId: number, itemIndex: number) => {
    try {
      const res = await fetch(`/api/products/${productId}/price`);
      const data = await res.json();
      if (data.success && data.data.price > 0) {
        const items = form.getFieldValue('items') || [];
        items[itemIndex] = { ...items[itemIndex], unitPrice: data.data.price };
        form.setFieldsValue({ items });
        message.success(`已自动填入价格: ¥${data.data.price.toFixed(2)}`);
      } else {
        message.info('该商品暂无历史价格，请手动输入');
      }
    } catch (e) { console.error(e); }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const items = values.items || [];
      if (items.length === 0) {
        message.error('请添加出库商品');
        return;
      }

      const submitData = {
        ...values,
        recipientTime: new Date().toISOString(),
        items: items.filter((i: any) => i && i.productId).map((i: any) => ({
          productId: Number(i.productId),
          quantity: Number(i.quantity),
          costPrice: Number(i.unitPrice || 0),
        })),
      };

      const res = await fetch('/api/stock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });
      const data = await res.json();
      if (data.success) {
        message.success('出库单创建成功');
        setCreateModalOpen(false);
        form.resetFields();
        loadOrders();
      } else {
        message.error(data.error || data.message || '创建失败');
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('创建失败');
    }
  };

  const handleScan = async () => {
    try {
      const values = await scanForm.validateFields();
      setScanLoading(true);
      const res = await fetch('/api/stock-out/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        setScanResult(data.data);
        message.success(`找到商品: ${data.data.productName}`);
      } else {
        if (data.error === '未找到商品') {
          setQuickAddBarcode(values.code || values.barcode || '');
          setQuickAddOpen(true);
          message.warning("未找到商品，可快速添加");
        } else {
          message.error(data.error || '未找到');
        }
        setScanResult(null);
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('查询失败');
    } finally {
      setScanLoading(false);
    }
  };

  // 摄像头回调必须身份稳定：BarcodeScanner 的启动 effect 依赖 onScan，
  // 内联箭头函数每次渲染都变，会导致摄像头反复 stop/重启动、一直卡在“正在启动摄像头…”
  // 另：表单字段是 code，此前内联回调误写 barcode，扫码后查不到商品
  const handleScanRef = useRef(handleScan);
  handleScanRef.current = handleScan;
  const handleCameraScan = useCallback((code: string) => {
    setShowCamera(false);
    message.success(`扫码成功: ${code}`);
    // Auto-fill and trigger scan
    scanForm.setFieldsValue({ code: code });
    handleScanRef.current();
  }, []);

  const handleScanSelect = async () => {
    if (!scanResult) return;
    // Fetch price first
    let price = 0;
    try {
      const res = await fetch(`/api/products/${scanResult.productId}/price`);
      const data = await res.json();
      if (data.success) price = data.data.price || 0;
    } catch (e) { console.error(e); }

    form.setFieldsValue({ 
      warehouseId: scanResult.warehouseId, 
      items: [{ productId: scanResult.productId, quantity: 1, unitPrice: price }] 
    });
    setScanModalOpen(false);
    setScanResult(null);
    setCreateModalOpen(true);
    if (price > 0) message.success(`已自动填入价格: ¥${price.toFixed(2)}`);
  };

  /**
   * F4 修复：过账确认框单例防重入——第一次点击立即置位 confirmLock，
   * 第二次点击直接 return，不会再叠出第二个 Modal.confirm 把页面锁死；
   * 确认框真正关闭后再在 afterClose 解锁。
   */
  const handlePost = (id: number) => {
    if (confirmLockRef.current) return;
    confirmLockRef.current = true;
    setPostingId(id);
    Modal.confirm({
      title: '确认过账',
      content: '过账后将更新库存，确定要过账吗？',
      okText: '确认过账',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await fetch(`/api/stock-out/${id}/post`, { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            message.success('过账成功');
            loadOrders();
          } else {
            message.error(data.error || data.message || '过账失败');
          }
        } catch (e) {
          message.error('过账失败');
        } finally {
          setPostingId(null);
        }
      },
      onCancel: () => setPostingId(null),
      afterClose: () => { confirmLockRef.current = false; },
    });
  };

  const columns = [
    { title: '出库单号', dataIndex: 'orderNo', key: 'orderNo', width: 140, render: (t: string) => <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{t}</span> },
    { title: '类型', dataIndex: 'type', key: 'type', width: 80, render: (t: string) => {
      const map: Record<string, { label: string; color: string }> = { SALES: { label: '销售', color: 'blue' }, SALE: { label: '销售', color: 'blue' }, REQUISITION: { label: '领用', color: 'geekblue' }, RETURN: { label: '退货', color: 'orange' }, TRANSFER: { label: '调拨', color: 'purple' }, MAINTAIN: { label: '维修', color: 'cyan' }, REPLACE: { label: '更换', color: 'magenta' }, OTHER: { label: '其他', color: 'default' } };
      const st = map[t] || { label: t, color: 'default' };
      return <Tag color={st.color}>{st.label}</Tag>;
    }},
    { title: '仓库', key: 'warehouse', width: 100, render: (_: any, r: any) => r.warehouse?.name || '-' },
    { title: '领用人', dataIndex: 'recipientName', key: 'recipientName', width: 80, render: (t: string) => t || '-' },
    { title: '使用部门', dataIndex: 'department', key: 'department', width: 100, render: (t: string) => t || '-' },
    { title: '总数量', dataIndex: 'totalQty', key: 'totalQty', width: 80, render: (v: any) => <span style={{ fontWeight: 600 }}>{Number(v || 0)}</span> },
    { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 100, render: (v: any) => v ? <span style={{ color: '#f5222d' }}>¥{Number(v).toFixed(2)}</span> : '-' },
    // F10：窄屏横向滚动时「状态」列会滑出可视区，移动端固定到右侧保证可读
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, fixed: isMobile ? ('right' as const) : undefined,
      // L4：旧映射缺项时会把状态码直出英文，统一走 OrderStatusBadge
      render: (s: string) => <OrderStatusBadge status={s} /> },
    // P2-1：原来 120px 用本地化日期（2026/11/11），列一被挤就只剩「2026/」。
    // 改成定长 YYYY-MM-DD + 加宽，任何宽度下都不会出现半截日期。
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (t: string) => {
        if (!t) return '-';
        const d = new Date(t);
        if (Number.isNaN(d.getTime())) return '-';
        const p = (n: number) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      } },
    { title: '操作', key: 'action', width: 180, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => router.push(`/stock-out/${record.id}`)}>查看</Button>
          {/* F3+L5：仅草稿渲染「过账」，其余状态只给详情，避免点了才被服务端拒绝 */}
          {(record.status === 'DRAFT' || record.status === 'draft') && (
            <Button type="link" size="small" icon={<CheckCircleOutlined />}
              loading={postingId === record.id}
              disabled={postingId === record.id}
              onClick={() => handlePost(record.id)}>过账</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>出库管理</h4>
        <Space>
          <Button
            icon={<ScanOutlined />}
            onClick={() => {
              setScanModalOpen(true);
              // FIX-2026-1016：点扫码直接拉起摄像头
              setShowCamera(true);
              setTimeout(() => scanInputRef.current?.focus(), 300);
            }}
          >扫码出库</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>手动出库</Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input prefix={<SearchOutlined />} placeholder="搜索出库单号" value={keyword} onChange={e => setKeyword(e.target.value)} style={{ width: 200 }} allowClear />
          <Select placeholder="状态筛选" value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }} allowClear>
            <Option value="DRAFT">草稿</Option>
            <Option value="LOCKED">已锁定</Option>
            <Option value="POSTED">已过账</Option>
            <Option value="CANCELLED">已取消</Option>
          </Select>
          <Button type="primary" icon={<SearchOutlined />} onClick={loadOrders}>查询</Button>
        </Space>
      </Card>

      <Card>
        {/* v1.2.1：原来重复写了两个 scroll 属性（TS17001），合并成响应式的一份 */}
        <Table columns={columns} dataSource={orders} loading={loading} rowKey="id" scroll={{ x: isMobile ? 800 : 1200 }}
            pagination={{ pageSize: 10 }} size="small" />
      </Card>

      {/* 手动出库弹窗 */}
      <Modal title="手动出库" open={createModalOpen} onCancel={() => setCreateModalOpen(false)} onOk={handleCreate} width={isMobile ? "95%" : 800} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ type: 'OTHER', items: [{}] }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="type" label="出库类型" rules={[{ required: true }]}>
                <Select>
                  <Option value="SALE">销售出库</Option>
                  <Option value="RETURN">退货出库</Option>
                  <Option value="TRANSFER">调拨出库</Option>
                  <Option value="MAINTAIN">维修出库</Option>
                  <Option value="REPLACE">更换出库</Option>
                  <Option value="OTHER">其他出库</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="warehouseId" label="出库仓库" rules={[{ required: true }]}>
                <Select placeholder="选择仓库">
                  {warehouses.map((w: any) => <Option key={w.id} value={w.id}>{w.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="recipientName" label="领用人" rules={[{ required: true }]}>
                <Input placeholder="输入领用人姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="department" label="使用部门" rules={[{ required: true }]}>
                <Input placeholder="输入使用部门" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="useLocation" label="使用地点" rules={[{ required: true }]}>
                <Input placeholder="输入使用地点" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="shift" label="使用班次">
                <Select placeholder="选择班次" allowClear>
                  <Option value="早班">早班</Option>
                  <Option value="中班">中班</Option>
                  <Option value="晚班">晚班</Option>
                  <Option value="长白">长白</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="deptManager" label="部门负责人" rules={[{ required: true }]}>
                <Input placeholder="输入部门负责人" />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text strong>出库商品</Text>
                  <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} size="small">添加商品</Button>
                </div>
                <Row gutter={8} style={{ marginBottom: 2, fontSize: 12, color: '#8C96A5' }}>
                  <Col span={8}>商品</Col>
                  <Col span={4}>数量</Col>
                  <Col span={6}>单价（元）</Col>
                  <Col span={4} style={{ textAlign: 'right' }}>小计</Col>
                  <Col span={2} />
                </Row>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} style={{ marginBottom: 8 }}>
                    <Col span={8}>
                      <Form.Item {...restField} name={[name, 'productId']} rules={[{ required: true, message: '请选择商品' }]}>
                        <Select 
                          placeholder="输入编码/名称搜索商品" 
                          showSearch 
                          filterOption={(input, option) => {
                            const label = option?.label?.toString() || '';
                            return label.toLowerCase().includes(input.toLowerCase());
                          }}
                          onChange={(val) => fetchProductPrice(val, name)}
                          options={products.map((p: any) => ({ 
                            value: p.id, 
                            label: `${p.code} - ${p.name}` 
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: '请输入数量' }]}>
                        <InputNumber
                          placeholder="数量"
                          min={1}
                          style={{ width: '100%' }}
                          onChange={() => { /* 小计由 itemsWatch 实时重算，这里只触发重渲染 */ }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item {...restField} name={[name, 'unitPrice']}>
                        <InputNumber 
                          placeholder="选择商品后自动填入" 
                          min={0} 
                          precision={2} 
                          style={{ width: '100%' }} 
                          prefix="¥"
                          addonAfter={
                            <ReloadOutlined 
                              style={{ cursor: 'pointer', color: '#1890ff' }} 
                              onClick={() => {
                                const productId = form.getFieldValue(['items', name, 'productId']);
                                if (productId) fetchProductPrice(productId, name);
                                else message.warning('请先选择商品');
                              }}
                              title="重新获取价格"
                            />
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      {/* 小计 = 数量 × 单价：实时跟随输入变化，不再需要提交后才知道金额 */}
                      <Form.Item label=" " colon={false} style={{ marginBottom: 8 }}>
                        <div style={{ height: 32, lineHeight: '32px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#B42318', fontWeight: 600 }}>
                          ¥{((Number(itemsWatch?.[name]?.quantity) || 0) * (Number(itemsWatch?.[name]?.unitPrice) || 0)).toFixed(2)}
                        </div>
                      </Form.Item>
                    </Col>
                    <Col span={2}>
                      <Button type="link" danger onClick={() => remove(name)}>删除</Button>
                    </Col>
                  </Row>
                ))}
              </>
            )}
          </Form.List>

          {/* 合计：数量与金额随明细实时重算 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, padding: '6px 2px 10px', borderTop: '1px dashed #E7EBF0', marginTop: 4 }}>
            <span style={{ color: '#5A6577' }}>
              合计数量：<b style={{ fontVariantNumeric: 'tabular-nums' }}>{formTotals.qty}</b>
            </span>
            <span style={{ color: '#5A6577' }}>
              合计金额：<b style={{ color: '#B42318', fontVariantNumeric: 'tabular-nums' }}>¥{formTotals.amount.toFixed(2)}</b>
            </span>
          </div>

          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 扫码出库弹窗 */}
      {/* L6：destroyOnClose 让关闭的弹窗卸载，避免扫码弹窗与手动出库弹窗同时挂载出现重复的 warehouseId/code id */}
      <Modal title="扫码出库" open={scanModalOpen} destroyOnClose onCancel={() => { setScanModalOpen(false); setScanResult(null); setShowCamera(false); }} footer={null} width={isMobile ? "95%" : 500}>
        <Form form={scanForm} layout="vertical">
          <Form.Item label="扫码识别">
            {showCamera ? (
              <div style={{ marginBottom: 12 }}>
                <BarcodeScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
                <Button block style={{ marginTop: 8 }} onClick={() => setShowCamera(false)}>关闭摄像头，改用手动输入</Button>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 6 }}>摄像头无法启动时，可直接在下方输入框手动输入条码后点“查询”</div>
              </div>
            ) : (
              isMobile && (
                <Button icon={<CameraOutlined />} block style={{ marginBottom: 12 }} onClick={() => setShowCamera(true)}>打开摄像头扫码</Button>
              )
            )}
          </Form.Item>
          <Form.Item name="code" label="条码/序列号">
            <Input ref={scanInputRef} placeholder="扫描或输入条码/SKU" onPressEnter={handleScan} autoFocus allowClear />
          </Form.Item>
          <Button type="primary" onClick={handleScan} loading={scanLoading} block>查询</Button>
        </Form>
        {scanResult && (
          <Card style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8 }}><Text strong>商品：</Text>{scanResult.productName}</div>
            <div style={{ marginBottom: 8 }}><Text strong>SKU：</Text>{scanResult.sku}</div>
            <div style={{ marginBottom: 8 }}><Text strong>库存：</Text>{scanResult.stock}</div>
            <div style={{ marginBottom: 8 }}><Text strong>仓库：</Text>{scanResult.warehouseName || '-'}</div>
            <Button type="primary" block onClick={handleScanSelect}>选择此商品出库</Button>
          </Card>
        )}
      </Modal>
    
      {/* 快速添加商品弹窗 */}
      <Modal title="快速添加商品" open={quickAddOpen} destroyOnClose onCancel={() => setQuickAddOpen(false)} footer={null} width={isMobile ? "95%" : 480}>
        <Form layout="vertical" onFinish={async (values) => {
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
              // 自动回填扫码表单
              scanForm.setFieldsValue({ code: values.barcode });
              handleScan();
            } else {
              message.error(data.error || "添加失败");
            }
          } catch (e) { message.error("添加失败"); }
        }}>
          <Form.Item label="条码" name="barcode" initialValue={quickAddBarcode}>
            <Input disabled />
          </Form.Item>
          <Form.Item label="商品名称" name="name" rules={[{ required: true }]}>
            <Input placeholder="输入商品名称" />
          </Form.Item>
          <Form.Item label="商品编码" name="code" rules={[{ required: true }]} initialValue={quickAddBarcode}>
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
