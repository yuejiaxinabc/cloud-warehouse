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
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

/** 调拨单表体行 */
interface TransferLine {
  key: string;
  productId?: string;
  requestedQty?: number;
  shippedQty?: number;
  receivedQty?: number;
  batchNo?: string;
  remark?: string;
}

interface TransferFormProps {
  editable?: boolean;
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void;
}

/** 调拨单表单 */
const TransferForm: React.FC<TransferFormProps> = ({
  editable = true,
  initialValues,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [lines, setLines] = React.useState<TransferLine[]>([{ key: '1' }]);

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

  const lineColumns: ColumnsType<TransferLine> = [
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
      title: '发运量',
      dataIndex: 'shippedQty',
      width: 100,
      render: () => (
        <InputNumber min={0} style={{ width: '100%' }} placeholder="发运量" disabled={!editable} />
      ),
    },
    {
      title: '收货量',
      dataIndex: 'receivedQty',
      width: 100,
      render: () => (
        <InputNumber min={0} style={{ width: '100%' }} placeholder="收货量" disabled={!editable} />
      ),
    },
    {
      title: '批号',
      dataIndex: 'batchNo',
      width: 130,
      render: () => <Input placeholder="批号" disabled={!editable} />,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 150,
      render: () => <Input placeholder="备注" disabled={!editable} />,
    },
    ...(editable
      ? [
          {
            title: '操作',
            key: 'action',
            width: 60,
            render: (_: unknown, record: TransferLine) => (
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
      <Card title="调拨单信息" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form form={form} layout="vertical" initialValues={initialValues}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              name="sourceWarehouseId"
              label="源仓库"
              rules={[{ required: true, message: '请选择源仓库' }]}
            >
              <Select
                placeholder="请选择源仓库"
                disabled={!editable}
                options={[
                  { label: '主仓库', value: 'wh1' },
                  { label: '华东仓', value: 'wh2' },
                  { label: '华南仓', value: 'wh3' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="targetWarehouseId"
              label="目的仓库"
              rules={[{ required: true, message: '请选择目的仓库' }]}
            >
              <Select
                placeholder="请选择目的仓库"
                disabled={!editable}
                options={[
                  { label: '主仓库', value: 'wh1' },
                  { label: '华东仓', value: 'wh2' },
                  { label: '华南仓', value: 'wh3' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="expectedDate"
              label="预计调拨日期"
              rules={[{ required: true, message: '请选择日期' }]}
            >
              <DatePicker style={{ width: '100%' }} disabled={!editable} />
            </Form.Item>

            <Form.Item name="reason" label="调拨原因">
              <Select
                placeholder="请选择调拨原因"
                disabled={!editable}
                options={[
                  { label: '库存平衡', value: 'balance' },
                  { label: '订单需求', value: 'order' },
                  { label: '仓库调整', value: 'adjust' },
                  { label: '其他', value: 'other' },
                ]}
              />
            </Form.Item>

            <Form.Item name="assignee" label="负责人">
              <Input placeholder="请输入负责人" disabled={!editable} />
            </Form.Item>

            <Form.Item name="remark" label="备注">
              <Input placeholder="请输入备注" disabled={!editable} />
            </Form.Item>
          </div>
        </Form>
      </Card>

      <Card
        title="调拨明细"
        style={{ marginBottom: 16, borderRadius: 8 }}
        extra={
          editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={addLine}>
              添加商品
            </Button>
          )
        }
      >
        <Table<TransferLine>
          columns={lineColumns}
          dataSource={lines}
          rowKey="key"
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
};

export default TransferForm;
