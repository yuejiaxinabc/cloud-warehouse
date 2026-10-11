'use client';

import React from 'react';
import {
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Card,
  Button,
  message,
} from 'antd';

interface AlertRuleFormProps {
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void;
  loading?: boolean;
}

/** 预警规则表单 */
const AlertRuleForm: React.FC<AlertRuleFormProps> = ({
  initialValues,
  onSubmit,
  loading = false,
}) => {
  const [form] = Form.useForm();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      onSubmit?.(values);
    } catch {
      message.error('请检查表单填写');
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={initialValues}
      style={{ maxWidth: 600 }}
    >
      <Card title="基本配置" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form.Item
          name="name"
          label="规则名称"
          rules={[{ required: true, message: '请输入规则名称' }]}
        >
          <Input placeholder="请输入规则名称" />
        </Form.Item>

        <Form.Item
          name="type"
          label="预警类型"
          rules={[{ required: true, message: '请选择预警类型' }]}
        >
          <Select
            placeholder="请选择预警类型"
            options={[
              { label: '库存不足', value: 'low_stock' },
              { label: '库存过剩', value: 'overstock' },
              { label: '临期预警', value: 'expiring' },
              { label: '过期预警', value: 'expired' },
              { label: '周转率低', value: 'low_turnover' },
              { label: '库龄过长', value: 'aging' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="level"
          label="预警级别"
          rules={[{ required: true, message: '请选择预警级别' }]}
        >
          <Select
            placeholder="请选择预警级别"
            options={[
              { label: '高（红色）', value: 'high' },
              { label: '中（橙色）', value: 'medium' },
              { label: '低（黄色）', value: 'low' },
            ]}
          />
        </Form.Item>
      </Card>

      <Card title="触发条件" style={{ marginBottom: 16, borderRadius: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item
            name="condition"
            label="条件"
            rules={[{ required: true, message: '请选择条件' }]}
          >
            <Select
              placeholder="请选择条件"
              options={[
                { label: '当前库存 < 阈值', value: 'lt' },
                { label: '当前库存 > 阈值', value: 'gt' },
                { label: '当前库存 = 阈值', value: 'eq' },
                { label: '保质期剩余 < N天', value: 'expire_lt' },
                { label: '最后出库 > N天', value: 'last_out_gt' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="threshold"
            label="阈值"
            rules={[{ required: true, message: '请输入阈值' }]}
          >
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              placeholder="请输入阈值"
            />
          </Form.Item>
        </div>
      </Card>

      <Card title="通知配置" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Form.Item
          name="notifyMethod"
          label="通知方式"
          rules={[{ required: true, message: '请选择通知方式' }]}
        >
          <Select
            mode="multiple"
            placeholder="请选择通知方式"
            options={[
              { label: '系统消息', value: 'system' },
              { label: '邮件', value: 'email' },
              { label: '短信', value: 'sms' },
            ]}
          />
        </Form.Item>

        <Form.Item name="notifyUsers" label="通知人员">
          <Select
            mode="multiple"
            placeholder="请选择通知人员"
            options={[
              { label: '管理员', value: 'admin' },
              { label: '仓库主管', value: 'wh_manager' },
              { label: '采购员', value: 'buyer' },
            ]}
          />
        </Form.Item>

        <Form.Item name="enabled" label="启用状态" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
      </Card>

      <Form.Item name="description" label="规则描述">
        <Input.TextArea rows={3} placeholder="请输入规则描述" />
      </Form.Item>
    </Form>
  );
};

export default AlertRuleForm;
