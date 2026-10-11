'use client';

import React from 'react';
import {
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Card,
  Table,
  Space,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

/** 入库单表体行 */
interface StockInLine {
  key: string;
  productId?: string;
  productName?: string;
  sku?: string;
  planQty?: number;
  actualQty?: number;
  batchNo?: string;
  productionDate?: string;
  expiryDate?: string;
  locationId?: string;
  unitPrice?: number;
  qualityStatus?: string;
}

interface StockInFormProps {
  /** 是否编辑模式 */
  editable?: boolean;
  /** 表单初始值 */
  initialValues?: Record<string, unknown>;
  /** 提交回调 */
  onSubmit?: (values: Record<string, unknown>) => void;
}

/** 入库单表单（表头+表体可增删行） */
const StockInForm: React.FC<StockInFormProps> = ({
  editable = true,
  initialValues,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [lines, setLines] = React.useState<StockInLine[]>([
    { key: '1' },
  ]);

  /** 添加行 */
  const addLine = () => {
    setLines([...lines, { key: String(Date.now()) }]);
  };

  /** 删除行 */
  const removeLine = (key: string) => {
    if (lines.length <= 1) {
      message.warning('至少保留一行明细');
      return;
    }
    setLines(lines.filter((l) => l.key !== key));
  };

  /** 表体列定义 */
  const lineColumns: ColumnsType<StockInLine> = [
    {
      title: '商品',
      dataIndex: 'productId',
      width: 200,
      render: (_, record) => (
        <Select
          placeholder="选择商品"
          style={{ width: '100%' }}
          showSearch
          options={[
            { label: 'SKU-001 商品A', value: 'p1' },
            { label: 'SKU-002 商品B', value: 'p2' },
            { label: 'SKU-003 商品C', value: 'p3' },
          ]}
          disabled={!editable}
        />
      ),
    },
    {
      title: '计划量',
      dataIndex: 'planQty',
      width: 100,
      render: (_, record) => (
        <InputNumber
          min={0}
          style={{ width: '100%' }}
          placeholder="计划量"
          disabled={!editable}
        />
      ),
    },
    {
      title: '实收量',
      dataIndex: 'actualQty',
      width: 100,
      render: (_, record) => (
        <InputNumber
          min={0}
          style={{ width: '100%' }}
          placeholder="实收量"
          disabled={!editable}
        />
      ),
    },
    {
      title: '批号',
      dataIndex: 'batchNo',
      width: 130,
      render: (_, record) => (
        <Input placeholder="批号" disabled={!editable} />
      ),
    },
    {
      title: '生产日期',
      dataIndex: 'productionDate',
      width: 130,
      render: () => (
        <DatePicker
          style={{ width: '100%' }}
          placeholder="生产日期"
          disabled={!editable}
        />
      ),
    },
    {
      title: '有效期',
      dataIndex: 'expiryDate',
      width: 130,
      render: () => (
        <DatePicker
          style={{ width: '100%' }}
          placeholder="有效期"
          disabled={!editable}
        />
      ),
    },
    {
      title: '库位',
      dataIndex: 'locationId',
      width: 120,
      render: () => (
        <Select
          placeholder="选择库位"
          style={{ width: '100%' }}
          options={[
            { label: 'A-01-01', value: 'loc1' },
            { label: 'A-01-02', value: 'loc2' },
          ]}
          disabled={!editable}
        />
      ),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 100,
      render: () => (
        <InputNumber
          min={0}
          precision={2}
          style={{ width: '100%' }}
          placeholder="单价"
          disabled={!editable}
        />
      ),
    },
    {
      title: '质量状态',
      dataIndex: 'qualityStatus',
      width: 100,
      render: () => (
        <Select
          placeholder="质量"
          style={{ width: '100%' }}
          options={[
            { label: '合格', value: 'qualified' },
            { label: '待检', value: 'pending' },
            { label: '不合格', value: 'unqualified' },
          ]}
          disabled={!editable}
        />
      ),
    },
    ...(editable
      ? [
          {
            title: '操作',
            key: 'action',
            width: 60,
            render: (_: unknown, record: StockInLine) => (
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeLine(record.key)}
                size="small"
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      {/* 表头信息 */}
      <Card title="单据信息" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              name="type"
              label="入库类型"
              rules={[{ required: true, message: '请选择入库类型' }]}
            >
              <Select
                placeholder="请选择入库类型"
                disabled={!editable}
                options={[
                  { label: '采购入库', value: 'purchase' },
                  { label: '生产入库', value: 'production' },
                  { label: '退货入库', value: 'return' },
                  { label: '调拨入库', value: 'transfer' },
                  { label: '其他入库', value: 'other' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="warehouseId"
              label="入库仓库"
              rules={[{ required: true, message: '请选择入库仓库' }]}
            >
              <Select
                placeholder="请选择仓库"
                disabled={!editable}
                options={[
                  { label: '主仓库', value: 'wh1' },
                  { label: '华东仓', value: 'wh2' },
                ]}
              />
            </Form.Item>

            <Form.Item name="supplierId" label="供应商">
              <Select
                placeholder="请选择供应商"
                disabled={!editable}
                options={[
                  { label: '供应商A', value: 's1' },
                  { label: '供应商B', value: 's2' },
                ]}
              />
            </Form.Item>

            <Form.Item name="poNo" label="采购单号">
              <Input placeholder="请输入关联采购单号" disabled={!editable} />
            </Form.Item>

            <Form.Item name="expectedDate" label="预计到货日期">
              <DatePicker style={{ width: '100%' }} disabled={!editable} />
            </Form.Item>

            <Form.Item name="remark" label="备注">
              <Input placeholder="请输入备注" disabled={!editable} />
            </Form.Item>
          </div>
        </Form>
      </Card>

      {/* 表体明细 */}
      <Card
        title="商品明细"
        style={{ marginBottom: 16, borderRadius: 8 }}
        extra={
          editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={addLine}>
              添加商品
            </Button>
          )
        }
      >
        <Table<StockInLine>
          columns={lineColumns}
          dataSource={lines}
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

export default StockInForm;
