'use client';

import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Table, Space, InputNumber, message, Typography, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title } = Typography;
const { Option } = Select;

export default function BomNewPage() {
  const router = useRouter();
  const [form] = Form.useForm();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([{ key: '1', materialId: undefined, quantity: 1, unit: '', remark: '' }]);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products?pageSize=1000');
      const data = await res.json();
      if (data.success) setProducts(data.data?.items || []);
    } catch (e) { console.error(e); }
  };

  const handleAddItem = () => {
    setItems([...items, { key: String(Date.now()), materialId: undefined, quantity: 1, unit: '', remark: '' }]);
  };

  const handleRemoveItem = (key: string) => {
    setItems(items.filter(item => item.key !== key));
  };

  const handleItemChange = (key: string, field: string, value: any) => {
    setItems(items.map(item => item.key === key ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const validItems = items.filter(item => item.materialId && item.quantity > 0);
      
      if (validItems.length === 0) {
        message.error('请添加至少一个物料');
        return;
      }

      setLoading(true);
      const res = await fetch('/api/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          items: validItems.map(item => ({
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            remark: item.remark,
          })),
        }),
      });
      const data = await res.json();
      if (data.success || data.code === 0) {
        message.success('BOM创建成功');
        router.push('/bom');
      } else {
        message.error(data.message || data.error || '创建失败');
      }
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('创建失败');
    } finally {
      setLoading(false);
    }
  };

  const itemColumns = [
    {
      title: '物料',
      dataIndex: 'materialId',
      width: 300,
      render: (_: any, record: any) => (
        <Select
          placeholder="输入编码/名称搜索物料"
          value={record.materialId}
          onChange={(val) => handleItemChange(record.key, 'materialId', val)}
          style={{ width: '100%' }}
          showSearch
          filterOption={(input, option) => {
            const label = option?.label?.toString() || '';
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          options={products.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
        />
      ),
    },
    {
      title: '用量',
      dataIndex: 'quantity',
      width: 120,
      render: (_: any, record: any) => (
        <InputNumber
          min={0.001}
          step={1}
          value={record.quantity}
          onChange={(val) => handleItemChange(record.key, 'quantity', val)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 100,
      render: (_: any, record: any) => (
        <Input
          value={record.unit}
          onChange={(e) => handleItemChange(record.key, 'unit', e.target.value)}
          placeholder="个/kg/m"
        />
      ),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 200,
      render: (_: any, record: any) => (
        <Input
          value={record.remark}
          onChange={(e) => handleItemChange(record.key, 'remark', e.target.value)}
          placeholder="备注"
        />
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: any, record: any) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.key)}>删除</Button>
      ),
    },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push('/bom')}>返回</Button>
      <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap" }}>新建BOM</h4>
        </Space>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>保存</Button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="bomNo" label="BOM编号" rules={[{ required: true }]}>
                <Input placeholder="输入BOM编号" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="productId" label="产品" rules={[{ required: true }]}>
                <Select
                  placeholder="选择产品"
                  showSearch
                  filterOption={(input, option) => {
                    const label = option?.label?.toString() || '';
                    return label.toLowerCase().includes(input.toLowerCase());
                  }}
                  options={products.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="version" label="版本" initialValue="v1.0">
                <Input placeholder="v1.0" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="status" label="状态" initialValue="draft">
                <Select>
                  <Option value="draft">草稿</Option>
                  <Option value="active">启用</Option>
                  <Option value="inactive">停用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="输入备注" />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title="物料清单"
        extra={
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddItem}>添加物料</Button>
        }
      >
        <Table
          columns={itemColumns}
          dataSource={items}
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}
