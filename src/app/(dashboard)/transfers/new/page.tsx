'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Form, Input, Select, Button, Typography, message, Space, Table, InputNumber, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { TextArea } = Input;

interface TransferItem {
  key: string;
  productId: number | undefined;
  quantity: number;
}

export default function NewTransferPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [items, setItems] = useState<TransferItem[]>([
    { key: '1', productId: undefined, quantity: 1 },
  ]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const res = await fetch('/api/warehouse');
      const data = await res.json();
      if (data.success) setWarehouses(data.data || []);
    } catch { /* ignore */ }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?pageSize=1000');
      const data = await res.json();
      if (data.success) setProducts(data.data?.items || data.data?.list || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchWarehouses();
    fetchProducts();
  }, [fetchWarehouses, fetchProducts]);

  const addItem = () => {
    const newKey = String(Date.now());
    setItems([...items, { key: newKey, productId: undefined, quantity: 1 }]);
  };

  const removeItem = (key: string) => {
    if (items.length <= 1) {
      message.warning('至少需要一个商品');
      return;
    }
    setItems(items.filter(item => item.key !== key));
  };

  const updateItem = (key: string, field: string, value: any) => {
    setItems(items.map(item =>
      item.key === key ? { ...item, [field]: value } : item
    ));
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const validItems = items.filter(item => item.productId && item.quantity > 0);
      if (validItems.length === 0) {
        message.error('请至少添加一个商品');
        return;
      }

      if (values.fromWarehouseId === values.toWarehouseId) {
        message.error('源仓库和目的仓库不能相同');
        return;
      }

      setLoading(true);

      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWhId: values.fromWarehouseId,
          toWhId: values.toWarehouseId,
          remark: values.remark,
          items: validItems.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (data.success) {
        message.success('调拨单创建成功');
        router.push('/transfers');
      } else {
        message.error(data.error || '创建失败');
      }
    } catch (e: any) {
      if (e.errorFields) return; // form validation
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  const itemColumns = [
    {
      title: '商品',
      dataIndex: 'productId',
      width: 300,
      render: (_: any, record: TransferItem) => (
        <Select
          placeholder="选择商品"
          value={record.productId}
          onChange={(val) => updateItem(record.key, 'productId', val)}
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="children"
          filterOption={(input, option) => {
            const label = (option?.children as string) || '';
            return label.toLowerCase().includes(input.toLowerCase());
          }}
        >
          {products.map(p => (
            <Select.Option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 150,
      render: (_: any, record: TransferItem) => (
        <InputNumber
          min={1}
          value={record.quantity}
          onChange={(val) => updateItem(record.key, 'quantity', val || 1)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: any, record: TransferItem) => (
        <Button
          type="link"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeItem(record.key)}
        />
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>新建调拨单</h4>
        <Space>
          <Button onClick={() => router.push('/transfers')}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>
            保存
          </Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="fromWarehouseId" label="源仓库" rules={[{ required: true, message: '请选择源仓库' }]}>
                <Select placeholder="选择源仓库">
                  {warehouses.map(w => (
                    <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="toWarehouseId" label="目的仓库" rules={[{ required: true, message: '请选择目的仓库' }]}>
                <Select placeholder="选择目的仓库">
                  {warehouses.map(w => (
                    <Select.Option key={w.id} value={w.id}>{w.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="输入备注信息" />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="调拨商品"
        extra={
          <Button type="dashed" icon={<PlusOutlined />} onClick={addItem}>
            添加商品
          </Button>
        }
      >
        <Table columns={itemColumns} dataSource={items} rowKey="key" pagination={false} size="small" />
      </Card>
    </div>
  );
}
