'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, Table, Button, Space, Input, Select, Tag, Row, Col, Modal, Form, message, Typography, InputNumber } from 'antd';
import { PlusOutlined, SearchOutlined, CheckCircleOutlined, ScanOutlined, EyeOutlined, ReloadOutlined, CameraOutlined } from '@ant-design/icons';
import dynamic from "next/dynamic";
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), { ssr: false });
import { useRouter } from 'next/navigation';

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
  const [form] = Form.useForm();
  const [scanForm] = Form.useForm();
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
      const res = await fetch('/api/products?pageSize=1000');
      const data = await res.json();
      if (data.success) setProducts(data.data?.items || []);
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

  const handleCameraScan = (code: string) => {
    setShowCamera(false);
    message.success(`扫码成功: ${code}`);
    // Auto-fill and trigger scan
    scanForm.setFieldsValue({ code: code });
    handleScan();
  };

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

  const handlePost = async (id: number) => {
    Modal.confirm({
      title: '确认过账',
      content: '过账后将更新库存，确定要过账吗？',
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
        }
      },
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
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (s: string) => {
      const map: Record<string, { label: string; color: string }> = { DRAFT: { label: '草稿', color: 'default' }, APPROVED: { label: '已审批', color: 'blue' }, LOCKED: { label: '已锁定', color: 'processing' }, POSTED: { label: '已过账', color: 'success' }, CANCELLED: { label: '已取消', color: 'error' } };
      const st = map[s] || { label: s, color: 'default' };
      return <Tag color={st.color}>{st.label}</Tag>;
    }},
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 120, render: (t: string) => t ? new Date(t).toLocaleDateString('zh-CN') : '-' },
    { title: '操作', key: 'action', width: 180, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => router.push(`/stock-out/${record.id}`)}>查看</Button>
          {(record.status === 'DRAFT' || record.status === 'draft') && (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handlePost(record.id)}>过账</Button>
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
        <Table columns={columns} dataSource={orders} loading={loading} rowKey="id" scroll={{ x: 1200 }} scroll={{ x: isMobile ? 800 : undefined }}
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
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={8} style={{ marginBottom: 8 }}>
                    <Col span={10}>
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
                    <Col span={5}>
                      <Form.Item {...restField} name={[name, 'quantity']} rules={[{ required: true, message: '请输入数量' }]}>
                        <InputNumber placeholder="数量" min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={7}>
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
                    <Col span={2}>
                      <Button type="link" danger onClick={() => remove(name)}>删除</Button>
                    </Col>
                  </Row>
                ))}
              </>
            )}
          </Form.List>

          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="输入备注信息" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 扫码出库弹窗 */}
      <Modal title="扫码出库" open={scanModalOpen} onCancel={() => { setScanModalOpen(false); setScanResult(null); setShowCamera(false); }} footer={null} width={isMobile ? "95%" : 500}>
        <Form form={scanForm} layout="vertical">
          <Form.Item label="扫码识别">
            {showCamera ? (
              <div style={{ marginBottom: 12 }}>
                <BarcodeScanner onScan={(code) => { setShowCamera(false); message.success(`扫码成功: ${code}`); scanForm.setFieldsValue({ barcode: code }); handleScan(); }} onClose={() => setShowCamera(false)} />
                <Button block style={{ marginTop: 8 }} onClick={() => setShowCamera(false)}>关闭摄像头</Button>
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
      <Modal title="快速添加商品" open={quickAddOpen} onCancel={() => setQuickAddOpen(false)} footer={null} width={isMobile ? "95%" : 480}>
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
