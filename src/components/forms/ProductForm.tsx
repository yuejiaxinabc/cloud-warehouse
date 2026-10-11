'use client';

import React, { useState } from 'react';
import {
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Card,
  Space,
  Divider,
  message,
  TreeSelect,
} from 'antd';
import type { FormInstance } from 'antd';

const { TextArea } = Input;

/** 商品分类树数据 */
const categoryTree = [
  {
    title: '电子产品',
    value: 'electronics',
    children: [
      { title: '手机', value: 'phone' },
      { title: '电脑', value: 'computer' },
      { title: '配件', value: 'accessories' },
    ],
  },
  {
    title: '食品饮料',
    value: 'food',
    children: [
      { title: '零食', value: 'snacks' },
      { title: '饮料', value: 'drinks' },
    ],
  },
  {
    title: '日用百货',
    value: 'daily',
    children: [
      { title: '清洁', value: 'cleaning' },
      { title: '个人护理', value: 'personal' },
    ],
  },
];

/** 供应商选项 */
const supplierOptions = [
  { label: '供应商A', value: 'supplier-a' },
  { label: '供应商B', value: 'supplier-b' },
  { label: '供应商C', value: 'supplier-c' },
];

interface ProductFormProps {
  form: FormInstance;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  loading?: boolean;
}

/** 商品创建/编辑表单 */
const ProductForm: React.FC<ProductFormProps> = ({
  form,
  initialValues,
  onSubmit,
  loading = false,
}) => {
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
    } catch {
      message.error('请检查表单填写');
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      style={{ maxWidth: 900 }}
    >
      {/* 基本信息 */}
      <Card title="基本信息" style={{ marginBottom: 16, borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item
            name="sku"
            label="SKU编码"
            rules={[{ required: true, message: '请输入SKU编码' }]}
          >
            <Input placeholder="请输入SKU编码" />
          </Form.Item>

          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input placeholder="请输入商品名称" />
          </Form.Item>

          <Form.Item
            name="categoryId"
            label="商品分类"
            rules={[{ required: true, message: '请选择商品分类' }]}
          >
            <TreeSelect
              treeData={categoryTree}
              placeholder="请选择商品分类"
              allowClear
              treeDefaultExpandAll
            />
          </Form.Item>

          <Form.Item
            name="unit"
            label="基本单位"
            rules={[{ required: true, message: '请选择基本单位' }]}
          >
            <Select
              placeholder="请选择基本单位"
              options={[
                { label: '个', value: 'pcs' },
                { label: '箱', value: 'box' },
                { label: '千克', value: 'kg' },
                { label: '米', value: 'm' },
                { label: '升', value: 'L' },
              ]}
            />
          </Form.Item>

          <Form.Item name="type" label="商品类型">
            <Select
              placeholder="请选择商品类型"
              options={[
                { label: '成品', value: 'finished' },
                { label: '原材料', value: 'material' },
                { label: '半成品', value: 'semi' },
                { label: '包装物', value: 'package' },
              ]}
            />
          </Form.Item>

          <Form.Item name="barcode" label="条形码">
            <Input placeholder="请输入条形码" />
          </Form.Item>
        </div>
      </Card>

      {/* 规格属性 */}
      <Card title="规格属性" style={{ marginBottom: 16, borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item name="brand" label="品牌">
            <Input placeholder="请输入品牌" />
          </Form.Item>

          <Form.Item name="model" label="型号/规格">
            <Input placeholder="请输入型号" />
          </Form.Item>

          <Form.Item name="color" label="颜色">
            <Input placeholder="请输入颜色" />
          </Form.Item>

          <Form.Item name="weight" label="重量(g)">
            <InputNumber placeholder="请输入重量" style={{ width: '100%' }} min={0} />
          </Form.Item>

          <Form.Item name="length" label="长(mm)">
            <InputNumber placeholder="请输入长度" style={{ width: '100%' }} min={0} />
          </Form.Item>

          <Form.Item name="width" label="宽(mm)">
            <InputNumber placeholder="请输入宽度" style={{ width: '100%' }} min={0} />
          </Form.Item>

          <Form.Item name="height" label="高(mm)">
            <InputNumber placeholder="请输入高度" style={{ width: '100%' }} min={0} />
          </Form.Item>

          <Form.Item name="volume" label="体积(cm³)">
            <InputNumber placeholder="请输入体积" style={{ width: '100%' }} min={0} />
          </Form.Item>
        </div>
      </Card>

      {/* 库存设置 */}
      <Card title="库存设置" style={{ marginBottom: 16, borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item name="safetyStock" label="安全库存">
            <InputNumber
              placeholder="请输入安全库存量"
              style={{ width: '100%' }}
              min={0}
            />
          </Form.Item>

          <Form.Item name="maxStock" label="最大库存">
            <InputNumber
              placeholder="请输入最大库存量"
              style={{ width: '100%' }}
              min={0}
            />
          </Form.Item>

          <Form.Item name="reorderPoint" label="再订货点">
            <InputNumber
              placeholder="请输入再订货点"
              style={{ width: '100%' }}
              min={0}
            />
          </Form.Item>

          <Form.Item name="shelfLife" label="保质期(天)">
            <InputNumber
              placeholder="请输入保质期天数"
              style={{ width: '100%' }}
              min={0}
            />
          </Form.Item>
        </div>
      </Card>

      {/* 供应商关联 */}
      <Card title="供应商关联" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form.Item name="suppliers" label="关联供应商">
          <Select
            mode="multiple"
            placeholder="请选择关联供应商"
            options={supplierOptions}
            allowClear
          />
        </Form.Item>

        <Form.Item name="defaultSupplier" label="默认供应商">
          <Select
            placeholder="请选择默认供应商"
            options={supplierOptions}
            allowClear
          />
        </Form.Item>
      </Card>

      {/* 备注 */}
      <Card title="其他信息" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form.Item name="remark" label="备注">
          <TextArea rows={3} placeholder="请输入备注信息" />
        </Form.Item>
      </Card>
    </Form>
  );
};

export default ProductForm;
