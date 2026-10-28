'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Space, Switch, Table, Tag, Typography,
} from 'antd';
import { ApiOutlined, KeyOutlined, LinkOutlined, SafetyOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

async function readJson(res: Response) {
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export default function SecurityPage() {
  const { message } = App.useApp();

  const [enabled, setEnabled] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const [hooks, setHooks] = useState<any[]>([]);
  const [hookOpen, setHookOpen] = useState(false);
  const [hookForm] = Form.useForm();

  const load2fa = useCallback(async () => {
    const json = await readJson(await fetch('/api/auth/2fa', { cache: 'no-store' }));
    if (json?.success) setEnabled(!!json.data?.enabled);
  }, []);

  const loadHooks = useCallback(async () => {
    const json = await readJson(await fetch('/api/webhooks', { cache: 'no-store' }));
    if (json?.success) setHooks(json.data || []);
  }, []);

  useEffect(() => { load2fa(); loadHooks(); }, [load2fa, loadHooks]);

  const do2fa = async (action: 'setup' | 'enable' | 'disable') => {
    setBusy(true);
    try {
      const json = await readJson(await fetch('/api/auth/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, code }),
      }));
      if (!json?.success) { message.error(json?.error || '操作失败'); return; }
      if (action === 'setup') {
        setSetupData(json.data);
        message.success('密钥已生成，把密钥加入验证器后输入 6 位码启用');
      } else if (action === 'enable') {
        message.success('两步验证已开启');
        setEnabled(true); setSetupData(null); setCode('');
      } else {
        message.success('两步验证已关闭');
        setEnabled(false); setSetupData(null); setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  const createHook = async () => {
    const values = await hookForm.validateFields();
    const json = await readJson(await fetch('/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    }));
    if (json?.success) {
      message.success('订阅已创建，请把 secret 交给对方用于验签');
      setHookOpen(false); hookForm.resetFields(); loadHooks();
    } else message.error(json?.error || '创建失败');
  };

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">安全与集成</h2>
          <p className="yc-page-desc">两步验证、Webhook 订阅与开放 API</p>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title={<Space><SafetyOutlined />两步验证（TOTP）</Space>}>
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              开启后登录除密码 + 验证码外，还需输入验证器 App 里的 6 位动态码。
              支持 Google Authenticator / 微软 Authenticator / 1Password。
            </Paragraph>

            <Space style={{ marginBottom: 12 }}>
              <Text>当前状态：</Text>
              {enabled ? <Tag color="green">已开启</Tag> : <Tag>未开启</Tag>}
            </Space>

            {!setupData && !enabled && (
              <div>
                <Button type="primary" loading={busy} onClick={() => do2fa('setup')}>生成密钥</Button>
              </div>
            )}

            {setupData && (
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>密钥（手动输入到验证器）</div>
                <Text code style={{ fontSize: 13, wordBreak: 'break-all' }}>{setupData.secret}</Text>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 6px' }}>otpauth 链接</div>
                <Text copyable={{ text: setupData.otpauth }} style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {setupData.otpauth}
                </Text>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="输入 6 位动态码"
                    style={{ width: 180, fontFamily: 'ui-monospace, monospace' }}
                  />
                  <Button type="primary" loading={busy} onClick={() => do2fa('enable')}>启用</Button>
                </div>
              </div>
            )}

            {enabled && (
              <Space>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="动态码"
                  style={{ width: 150, fontFamily: 'ui-monospace, monospace' }}
                />
                <Button danger loading={busy} onClick={() => do2fa('disable')}>关闭两步验证</Button>
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={<Space><ApiOutlined />开放 API</Space>}
            extra={<a href="/settings" style={{ fontSize: 13 }}>管理 API Token</a>}
          >
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              用 <Text code>Authorization: Bearer &lt;API Token&gt;</Text> 调用，只读接口：
            </Paragraph>
            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 2 }}>
              <li><Text code>GET /api/v1/open/products</Text> 商品 + 库存汇总</li>
              <li><Text code>GET /api/v1/open/inventory</Text> 按仓库的库存明细</li>
              <li><Text code>GET /api/v1/open/movements?since=</Text> 增量库存流水</li>
            </ul>
            <Text type="secondary" style={{ fontSize: 12 }}>
              全部支持 page / pageSize 分页；建议配合 since / updatedSince 做增量同步。
            </Text>
          </Card>
        </Col>
      </Row>

      <Card
        style={{ marginTop: 16 }}
        title={<Space><LinkOutlined />Webhook 订阅</Space>}
        extra={<Button type="primary" onClick={() => setHookOpen(true)}>新增订阅</Button>}
      >
        <Table
          size="middle"
          rowKey="id"
          dataSource={hooks}
          pagination={false}
          locale={{ emptyText: '还没有订阅。新建后，商品建档 / 入库过账 / 出库过账会自动推送' }}
          columns={[
            { title: '名称', dataIndex: 'name', width: 160 },
            { title: '回调地址', dataIndex: 'url', ellipsis: true },
            { title: '事件', dataIndex: 'events', width: 180, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
            {
              title: '最近状态', key: 'last', width: 130,
              render: (_: any, r: any) => (r.lastStatus == null
                ? <Text type="secondary">未推送</Text>
                : r.lastStatus >= 200 && r.lastStatus < 300
                  ? <Tag color="green">{r.lastStatus}</Tag>
                  : <Tag color="red">{r.lastStatus || '失败'}</Tag>),
            },
            {
              title: '', key: 'act', width: 100, align: 'right' as const,
              render: (_: any, r: any) => (
                <Popconfirm title="删除该订阅？" okText="删除" cancelText="取消"
                  onConfirm={async () => {
                    const json = await readJson(await fetch(`/api/webhooks?id=${r.id}`, { method: 'DELETE' }));
                    if (json?.success) { message.success('已删除'); loadHooks(); } else message.error(json?.error || '删除失败');
                  }}>
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <Modal title="新增 Webhook 订阅" open={hookOpen} onCancel={() => setHookOpen(false)} onOk={createHook} okText="创建" cancelText="取消">
        <Form form={hookForm} layout="vertical" initialValues={{ events: '*' }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如：ERP 库存同步" />
          </Form.Item>
          <Form.Item name="url" label="回调地址" rules={[{ required: true, message: '请输入回调地址' }]}>
            <Input placeholder="https://erp.example.com/webhooks/yuncang" />
          </Form.Item>
          <Form.Item name="events" label="订阅事件" extra="多个用英文逗号分隔；* 表示全部">
            <Input placeholder="*, product.created, inbound.posted, outbound.posted" />
          </Form.Item>
          <Form.Item name="secret" label="签名密钥（留空自动生成）">
            <Input placeholder="用于校验 x-yc-signature" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
