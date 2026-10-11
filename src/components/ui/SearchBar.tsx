'use client';

import React from 'react';
import { Form, Input, Select, DatePicker, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;

/** 筛选项类型 */
interface FilterField {
  name: string;
  label: string;
  type: 'input' | 'select' | 'dateRange' | 'date';
  placeholder?: string;
  options?: { label: string; value: string | number }[];
  span?: number;
}

interface SearchBarProps {
  fields: FilterField[];
  onSearch: (values: Record<string, unknown>) => void;
  onReset?: () => void;
  loading?: boolean;
  extra?: React.ReactNode;
}

/** 统一筛选条组件 */
const SearchBar: React.FC<SearchBarProps> = ({
  fields,
  onSearch,
  onReset,
  loading = false,
  extra,
}) => {
  const [form] = Form.useForm();

  const handleReset = () => {
    form.resetFields();
    onReset?.();
  };

  const handleFinish = (values: Record<string, unknown>) => {
    // 处理日期范围
    const processed = { ...values };
    fields.forEach((field) => {
      if (field.type === 'dateRange' && processed[field.name]) {
        const [start, end] = processed[field.name] as [unknown, unknown];
        processed[`${field.name}Start`] = start;
        processed[`${field.name}End`] = end;
        delete processed[field.name];
      }
    });
    onSearch(processed);
  };

  return (
    <div className="filter-bar">
      <Form form={form} layout="inline" onFinish={handleFinish}>
        <Space size={12} wrap>
          {fields.map((field) => {
            switch (field.type) {
              case 'input':
                return (
                  <Form.Item key={field.name} name={field.name} style={{ marginBottom: 0 }}>
                    <Input
                      placeholder={field.placeholder || `请输入${field.label}`}
                      allowClear
                      style={{ width: 180 }}
                    />
                  </Form.Item>
                );
              case 'select':
                return (
                  <Form.Item key={field.name} name={field.name} style={{ marginBottom: 0 }}>
                    <Select
                      placeholder={field.placeholder || `请选择${field.label}`}
                      allowClear
                      style={{ width: 160 }}
                      options={field.options}
                    />
                  </Form.Item>
                );
              case 'dateRange':
                return (
                  <Form.Item key={field.name} name={field.name} style={{ marginBottom: 0 }}>
                    <RangePicker
                      placeholder={['开始日期', '结束日期']}
                      style={{ width: 240 }}
                    />
                  </Form.Item>
                );
              case 'date':
                return (
                  <Form.Item key={field.name} name={field.name} style={{ marginBottom: 0 }}>
                    <DatePicker
                      placeholder={field.placeholder || `请选择${field.label}`}
                      style={{ width: 160 }}
                    />
                  </Form.Item>
                );
              default:
                return null;
            }
          })}
          <Form.Item style={{ marginBottom: 0 }}>
            <Space size={8}>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                htmlType="submit"
                loading={loading}
              >
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
              {extra}
            </Space>
          </Form.Item>
        </Space>
      </Form>
    </div>
  );
};

export default SearchBar;
