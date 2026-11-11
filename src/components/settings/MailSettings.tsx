'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tag, Typography,
} from 'antd';
import { MailOutlined, SendOutlined } from '@ant-design/icons';

const { Text } = Typography;

import { settingsRequest } from './request';

/** 系统设置 → 邮件与订阅（v1.2.0） */
export default function MailSettings() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [effective, setEffective] = useState<string>('');

  const [subs, setSubs] = useState<any[]>([]);
  // v1.2.4：订阅必须绑定邮件模板，模板列表由后端下发
  const [templates, setTemplates] = useState<any[]>([]);
  const [subOpen, setSubOpen] = useState(false);
  const [subForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await settingsRequest('/api/settings/smtp', { cache: 'no-store' });
      if (json?.success && json.data?.configured) {
        setConfigured(true);
        setEffective(json.data.effectiveFrom || '');
        form.setFieldsValue({
          host: json.data.host,
          port: json.data.port,
          secure: json.data.secure,
          user: json.data.user,
          from: json.data.from,
          enabled: json.data.enabled,
          pass: '',
        });
      } else {
        setConfigured(false);
        form.setFieldsValue({ port: 465, secure: true, enabled: true });
      }
    } catch (e: any) { if (!e.errorFields) message.error(e.message || '请求失败，请重试'); } finally {
      setLoading(false);
    }
  }, [form]);

  const loadSubs = useCallback(async () => {
    try {
      const json = await settingsRequest('/api/reports/subscriptions', { cache: 'no-store' });
      const payload = json?.data || {};
      setSubs(Array.isArray(payload.items) ? payload.items : []);
      setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
    } catch (e: any) { message.error(e.message || '订阅加载失败'); }
  }, []);

  useEffect(() => { load(); loadSubs(); }, [load, loadSubs]);

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const json = await settingsRequest('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (json?.success) { message.success('已保存'); load(); }
      else message.error(json?.error || '保存失败');
    } catch (e: any) { if (!e.errorFields) message.error(e.message || '请求失败，请重试'); } finally {
      setSaving(false);
    }
  };

  const test = async (mode: 'verify' | 'send') => {
    setTesting(true);
    try {
      const values = await form.validateFields();
      const to = mode === 'send' ? String(values.testTo || '').trim() : undefined;
      const json = await settingsRequest('/api/settings/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, to }),
      });
      if (json?.success) message.success(json.message || '测试通过');
      else message.error(json?.error || '测试失败', 6);
    } catch (e: any) { if (!e.errorFields) message.error(e.message || '请求失败，请重试'); } finally {
      setTesting(false);
    }
  };

  const createSub = async () => {
    try {
    const values = await subForm.validateFields();
    const json = await settingsRequest('/api/reports/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (json?.success) {
      message.success('订阅已创建');
      setSubOpen(false); subForm.resetFields(); loadSubs();
    } else message.error('创建失败');
    } catch (e: any) { if (!e.errorFields) message.error(e.message || '创建失败'); }
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="SMTP 由管理员在这里配置，保存后立即生效，无需重启服务"
        description={
          <>
            <div>配置成功后，「库存日报/周报」会按订阅时间自动发到指定邮箱；服务器上每小时第 5 分钟检查一次是否到点。</div>
            <div style={{ marginTop: 6 }}>
              腾讯/QQ/163 等企业邮箱要求「信封发件人 = 登录账号」：<b>发件账号填完整邮箱</b>，发件人显示名只写名字。
              若报 <code>440 mail from account doesn&apos;t conform with authentication</code>，就是这两项不一致。
            </div>
            {effective && (
              <div style={{ marginTop: 6 }}>当前实际发件人：<b>{effective}</b></div>
            )}
          </>
        }
      />

      <Card
        title={<Space><MailOutlined />SMTP 服务器</Space>}
        extra={configured ? <Tag color="green">已配置</Tag> : <Tag>未配置</Tag>}
        loading={loading}
      >
        <Form form={form} layout="vertical" initialValues={{ port: 465, secure: true, enabled: true }}>
          <Row gutter={16}>
            <Col xs={24} md={10}>
              <Form.Item name="host" label="SMTP 服务器" rules={[{ required: true, message: '例如 smtp.exmail.qq.com' }]}>
                <Input placeholder="smtp.exmail.qq.com" />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="port" label="端口" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} max={65535} />
              </Form.Item>
            </Col>
            <Col xs={12} md={5}>
              <Form.Item name="secure" label="加密方式" tooltip="465 一般选 SSL；25/587 选关闭（走 STARTTLS）">
                <Switch checkedChildren="SSL" unCheckedChildren="STARTTLS" />
              </Form.Item>
            </Col>
            <Col xs={24} md={4}>
              <Form.Item name="enabled" label="启用">
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item
                name="user"
                label="发件账号（完整邮箱）"
                rules={[{ pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: '请填写完整邮箱，如 notify@yourdomain.com' }]}
                extra="企业邮箱要求 MAIL FROM 必须等于这个账号"
              >
                <Input placeholder="system@yourdomain.com" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="pass" label="授权码 / 密码" extra="留空表示不修改已保存的密码">
                <Input.Password placeholder="邮箱授权码" autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="from" label="发件人显示名" extra="只写名字即可，地址自动用上面的发件账号">
                <Input placeholder="云仓仓储" />
              </Form.Item>
            </Col>

            <Col xs={24} md={8}>
              <Form.Item name="testTo" label="测试收件人" extra="点「发送测试邮件」时用">
                <Input placeholder="me@yourdomain.com" />
              </Form.Item>
            </Col>
          </Row>

          <Space wrap>
            <Button type="primary" loading={saving} onClick={save}>保存配置</Button>
            <Button icon={<MailOutlined />} loading={testing} onClick={() => test('verify')}>测试连接</Button>
            <Button icon={<SendOutlined />} loading={testing} onClick={() => test('send')}>发送测试邮件</Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              「测试连接」只握手登录不发信；「发送测试邮件」会真的发一封到上面的测试收件人
            </Text>
          </Space>
        </Form>
      </Card>

      <Card
        style={{ marginTop: 16 }}
        title="报表订阅"
        extra={<Button type="primary" onClick={() => setSubOpen(true)}>新增订阅</Button>}
      >
        <Table
          size="middle"
          rowKey="id"
          dataSource={subs}
          pagination={false}
          locale={{ emptyText: '还没有订阅。配置 SMTP 后新增一条，库存日报/周报会按时发出' }}
          columns={[
            { title: '名称', dataIndex: 'name', width: 180 },
            {
              title: '频率', dataIndex: 'type', width: 140,
              render: (v: string, r: any) => (v === 'weekly'
                ? <Tag color="blue">每周{['一', '二', '三', '四', '五', '六', '日'][(r.weekday || 1) - 1]} {r.sendHour}:00</Tag>
                : <Tag color="cyan">每天 {r.sendHour}:00</Tag>),
            },
            { title: '模板', dataIndex: 'templateName', width: 150, render: (v: string) => <Tag color="purple">{v || '未绑定'}</Tag> },
            { title: '收件人', dataIndex: 'recipients', ellipsis: true },
            {
              title: '状态', dataIndex: 'enabled', width: 90,
              render: (v: number, r: any) => (
                <Switch
                  size="small"
                  checked={v === 1}
                  onChange={async (checked) => {
                    try { await settingsRequest('/api/reports/subscriptions', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: r.id, enabled: checked }),
                    });
                    await loadSubs();
                    } catch (e: any) { message.error(e.message || "更新失败"); }
                  }}
                />
              ),
            },
            {
              title: '最近发送', dataIndex: 'lastSentAt', width: 170,
              render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : <Text type="secondary">未发送</Text>),
            },
            {
              title: '', key: 'act', width: 90, align: 'right' as const,
              render: (_: any, r: any) => (
                <Button type="link" size="small" danger onClick={async () => {
                  try { await settingsRequest(`/api/reports/subscriptions?id=${r.id}`, { method: 'DELETE' });
                  message.success('已删除'); await loadSubs();
                  } catch (e: any) { message.error(e.message || '删除失败'); }
                }}>删除</Button>
              ),
            },
          ]}
        />
      </Card>

      <Modal title="新增报表订阅" open={subOpen} onCancel={() => setSubOpen(false)} onOk={createSub} okText="创建" cancelText="取消">
        <Form form={subForm} layout="vertical" initialValues={{ type: 'daily', sendHour: 8, weekday: 1 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input placeholder="库存日报" />
          </Form.Item>
          <Form.Item
            name="templateCode"
            label="邮件模板"
            rules={[{ required: true, message: '请选择邮件模板' }]}
            extra="邮件主题与正文由模板决定；模板里的 {{变量}} 会在发送时自动填充"
          >
            <Select
              placeholder="选择一个模板"
              options={templates.map((t) => ({ value: t.code, label: t.name + '（' + t.code + '）' }))}
              notFoundContent="没有可用模板，请先在「邮件模板」里创建"
            />
          </Form.Item>
          <Form.Item name="type" label="频率">
            <Select options={[{ value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }]} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sendHour" label="发送时间（整点）">
                <Select options={Array.from({ length: 24 }, (_, i) => ({ value: i, label: `${i}:00` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="weekday" label="周报星期" tooltip="仅「每周」生效">
                <Select options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: `周${['一', '二', '三', '四', '五', '六', '日'][d - 1]}` }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="recipients" label="收件人" rules={[{ required: true, message: '多个收件人用英文逗号分隔' }]}>
            <Input placeholder="boss@company.com,ops@company.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
