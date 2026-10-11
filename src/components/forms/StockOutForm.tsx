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
  Tag,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

/** 出库单表体行 */
interface StockOutLine {
  key: string;
  productId?: string;
  requestedQty?: number;
  actualQty?: number;
  availableQty?: number;
  batchNo?: string;
  locationId?: string;
  unitPrice?: number;
}

interface StockOutFormProps {
  editable?: boolean;
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void;
}

/** 出库单表单 */
const StockOutForm: React.FC<StockOutFormProps> = ({
  editable = true,
  initialValues,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [lines, setLines] = React.useState<StockOutLine[]>([{ key: '1' }]);

  const addLine = () => {
    setLines([...lines, { key: String(Date.now()) }]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 1) {
      message.warning('至少保留一行明细');
      return;
    }
    setLines(lines.filter((l) => l.key !== key));
  };

  /** 表体列定义 */
  const lineColumns: ColumnsType<StockOutLine> = [
    {
      title: '商品',
      dataIndex: 'productId',
      width: 200,
      render: () => (
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
      title: '申请量',
      dataIndex: 'requestedQty',
      width: 100,
      render: () => (
        <InputNumber min={0} style={{ width: '100%' }} placeholder="申请量" disabled={!editable} />
      ),
    },
    {
      title: '可用量',
      dataIndex: 'availableQty',
      width: 100,
      render: (qty: number) => {
        const isInsufficient = qty !== undefined && qty < 0;
        return (
          <span style={{ color: isInsufficient ? '#D32F2F' : '#2E7D32', fontWeight: 500 }}>
            {qty ?? '-'}
          </span>
        );
      },
    },
    {
      title: '实发量',
      dataIndex: 'actualQty',
      width: 100,
      render: () => (
        <InputNumber min={0} style={{ width: '100%' }} placeholder="实发量" disabled={!editable} />
      ),
    },
    {
      title: '批号',
      dataIndex: 'batchNo',
      width: 130,
      render: () => <Input placeholder="批号" disabled={!editable} />,
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
        <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="单价" disabled={!editable} />
      ),
    },
    ...(editable
      ? [
          {
            title: '操作',
            key: 'action',
            width: 60,
            render: (_: unknown, record: StockOutLine) => (
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
        <Form form={form} layout="vertical" initialValues={initialValues}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              name="type"
              label="出库类型"
              rules={[{ required: true, message: '请选择出库类型' }]}
            >
              <Select
                placeholder="请选择出库类型"
                disabled={!editable}
                options={[
                  { label: '销售出库', value: 'sales' },
                  { label: '生产领料', value: 'production' },
                  { label: '退货出库', value: 'return' },
                  { label: '调拨出库', value: 'transfer' },
                  { label: '其他出库', value: 'other' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="warehouseId"
              label="出库仓库"
              rules={[{ required: true, message: '请选择出库仓库' }]}
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

            <Form.Item name="customerId" label="客户">
              <Select
                placeholder="请选择客户"
                disabled={!editable}
                options={[
                  { label: '客户A', value: 'c1' },
                  { label: '客户B', value: 'c2' },
                ]}
              />
            </Form.Item>

            <Form.Item name="soNo" label="销售单号">
              <Input placeholder="请输入关联销售单号" disabled={!editable} />
            </Form.Item>

            <Form.Item name="expectedDate" label="预计发货日期">
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
        <Table<StockOutLine>
          columns={lineColumns}
          dataSource={lines}
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ x: 1100 }}
        />
      </Card>
    </div>
  );
};

export default StockOutForm;
