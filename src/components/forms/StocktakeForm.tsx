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

/** 盘点单表体行 */
interface StocktakeLine {
  key: string;
  productId?: string;
  locationId?: string;
  bookQty?: number;
  actualQty?: number;
  diffQty?: number;
  diffRate?: number;
}

interface StocktakeFormProps {
  editable?: boolean;
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void;
}

/** 盘点单表单 */
const StocktakeForm: React.FC<StocktakeFormProps> = ({
  editable = true,
  initialValues,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [lines, setLines] = React.useState<StocktakeLine[]>([{ key: '1' }]);

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

  const lineColumns: ColumnsType<StocktakeLine> = [
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
      title: '库位',
      dataIndex: 'locationId',
      width: 130,
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
      title: '账面量',
      dataIndex: 'bookQty',
      width: 100,
      render: (qty: number) => <span style={{ fontWeight: 500 }}>{qty ?? '-'}</span>,
    },
    {
      title: '实盘量',
      dataIndex: 'actualQty',
      width: 100,
      render: () => (
        <InputNumber min={0} style={{ width: '100%' }} placeholder="实盘量" disabled={!editable} />
      ),
    },
    {
      title: '差异量',
      dataIndex: 'diffQty',
      width: 100,
      render: (diff: number) => {
        if (diff === undefined || diff === null) return '-';
        const color = diff > 0 ? '#2E7D32' : diff < 0 ? '#D32F2F' : '#6B7280';
        return <span style={{ color, fontWeight: 500 }}>{diff > 0 ? `+${diff}` : diff}</span>;
      },
    },
    {
      title: '差异率',
      dataIndex: 'diffRate',
      width: 100,
      render: (rate: number) => {
        if (rate === undefined || rate === null) return '-';
        const color = Math.abs(rate) > 10 ? '#D32F2F' : Math.abs(rate) > 5 ? '#ED6C02' : '#2E7D32';
        return <span style={{ color }}>{rate.toFixed(1)}%</span>;
      },
    },
    ...(editable
      ? [
          {
            title: '操作',
            key: 'action',
            width: 60,
            render: (_: unknown, record: StocktakeLine) => (
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
      <Card title="盘点单信息" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form form={form} layout="vertical" initialValues={initialValues}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              name="type"
              label="盘点类型"
              rules={[{ required: true, message: '请选择盘点类型' }]}
            >
              <Select
                placeholder="请选择盘点类型"
                disabled={!editable}
                options={[
                  { label: '全盘', value: 'full' },
                  { label: '抽盘', value: 'sample' },
                  { label: '循环盘点', value: 'cycle' },
                  { label: '动碰盘', value: 'movement' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="warehouseId"
              label="盘点仓库"
              rules={[{ required: true, message: '请选择盘点仓库' }]}
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

            <Form.Item
              name="planDate"
              label="计划盘点日期"
              rules={[{ required: true, message: '请选择计划日期' }]}
            >
              <DatePicker style={{ width: '100%' }} disabled={!editable} />
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
        title="盘点明细"
        style={{ marginBottom: 16, borderRadius: 8 }}
        extra={
          editable && (
            <Button type="primary" icon={<PlusOutlined />} onClick={addLine}>
              添加商品
            </Button>
          )
        }
      >
        <Table<StocktakeLine>
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

export default StocktakeForm;
