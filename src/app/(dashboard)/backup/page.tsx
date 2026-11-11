'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm,
  Select, Space, Switch, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  CloudDownloadOutlined, DatabaseOutlined, DeleteOutlined, ReloadOutlined,
  SafetyCertificateOutlined, UndoOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface BackupItem {
  id: number;
  fileName: string;
  kind: 'full' | 'database' | 'files';
  status: 'running' | 'success' | 'failed';
  sizeBytes: number;
  durationMs: number;
  checksum: string | null;
  note: string | null;
  error: string | null;
  trigger: string;
  createdByName: string | null;
  createdAt: string;
}

interface BackupConfig {
  autoBackupEnabled: boolean;
  backupSchedule: string;
  backupScheduleLabel: string;
  backupRetentionDays: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  backupDir: string;
  diskFreeGb: number;
  totalSizeBytes: number;
}

const KIND_LABEL: Record<string, { text: string; color: string }> = {
  full: { text: '完整备份', color: 'blue' },
  database: { text: '仅数据库', color: 'geekblue' },
  files: { text: '仅文件', color: 'cyan' },
};
const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  success: { text: '成功', color: 'green' },
  failed: { text: '失败', color: 'red' },
  running: { text: '进行中', color: 'blue' },
};
const SCHEDULE_OPTIONS = [
  { label: '每小时', value: 'hourly' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '自定义 Cron（如 0 2 * * *）', value: 'custom' },
];

function humanSize(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('登录已过期，请重新登录');
  if (res.status === 403) throw new Error('权限不足，请联系管理员');
  let data: any = null;
  try { data = await res.json(); } catch { throw new Error('服务返回异常（非 JSON）'); }
  if (!res.ok || data?.success === false) throw new Error(data?.error || '操作失败');
  return data;
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [items, setItems] = useState<BackupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  // 两个独立表单：策略配置与立即备份，避免同一 form 实例被两处 <Form> 共享导致取值串台
  const [configForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [restoreText, setRestoreText] = useState('');

  const load = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const d = await call('/api/backups?page=' + p + '&pageSize=' + ps);
      setItems(d.data.items || []);
      setTotal(d.data.total || 0);
      setConfig(d.data.config || null);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => { load(1, pageSize); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!config) return;
    configForm.setFieldsValue({
      autoBackupEnabled: config.autoBackupEnabled,
      schedulePreset: ['hourly', 'daily', 'weekly'].includes(config.backupSchedule) ? config.backupSchedule : 'custom',
      backupSchedule: config.backupSchedule,
      backupRetentionDays: config.backupRetentionDays,
    });
  }, [config, configForm]);

  const schedulePreset = Form.useWatch('schedulePreset', configForm);

  const saveConfig = async () => {
    try {
      const values = await configForm.validateFields();
      const schedule = values.schedulePreset === 'custom' ? values.backupSchedule : values.schedulePreset;
      if (!schedule || !String(schedule).trim()) { message.warning('请填写备份频率'); return; }
      setBusy('config');
      await call('/api/backups', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save-config',
          autoBackupEnabled: !!values.autoBackupEnabled,
          backupSchedule: String(schedule).trim(),
          backupRetentionDays: Number(values.backupRetentionDays) || 30,
        }),
      });
      message.success('备份策略已保存');
      await load(page, pageSize);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const createBackup = async () => {
    try {
      const values = await actionForm.validateFields(['kind', 'note']);
      setBusy('create');
      const d = await call('/api/backups', {
        method: 'POST',
        body: JSON.stringify({ action: 'create', kind: values.kind || 'full', note: values.note || undefined }),
      });
      message.success('备份完成：' + d.data.fileName + '（' + humanSize(d.data.sizeBytes) + '）');
      await load(page, pageSize);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    if (restoreText.trim().toUpperCase() !== 'RESTORE') { message.warning('请输入 RESTORE 以确认'); return; }
    try {
      setBusy('restore');
      const d = await call('/api/backups', {
        method: 'POST',
        body: JSON.stringify({ action: 'restore', id: restoreTarget.id }),
      });
      setRestoreTarget(null);
      setRestoreText('');
      message.success(d.message || '恢复完成');
      await load(page, pageSize);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (row: BackupItem) => {
    try {
      setBusy('delete-' + row.id);
      await call('/api/backups', { method: 'POST', body: JSON.stringify({ action: 'delete', id: row.id }) });
      message.success('已删除');
      await load(page, pageSize);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const columns = useMemo(() => [
    {
      title: '备份时间', dataIndex: 'createdAt', width: 170,
      render: (v: string) => <span>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span>,
    },
    {
      title: '类型', dataIndex: 'kind', width: 110,
      render: (v: string) => {
        const meta = KIND_LABEL[v] || KIND_LABEL.full;
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string, row: BackupItem) => {
        const meta = STATUS_LABEL[v] || STATUS_LABEL.running;
        if (v === 'failed' && row.error) {
          return <Tooltip title={row.error}><Tag color={meta.color}>{meta.text}</Tag></Tooltip>;
        }
        return <Tag color={meta.color}>{meta.text}</Tag>;
      },
    },
    { title: '大小', dataIndex: 'sizeBytes', width: 100, render: (v: number) => humanSize(v) },
    { title: '耗时', dataIndex: 'durationMs', width: 90, render: (v: number) => (v ? (v / 1000).toFixed(1) + ' s' : '-') },
    {
      title: '触发', dataIndex: 'trigger', width: 90,
      render: (v: string) => <Tag>{v === 'schedule' ? '定时' : '手动'}</Tag>,
    },
    {
      title: '操作人 / 备注', dataIndex: 'note', ellipsis: true,
      render: (_: any, row: BackupItem) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{row.createdByName || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{row.note || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '操作', width: 190, fixed: 'right' as const,
      render: (_: any, row: BackupItem) => (
        <Space size={4}>
          <Tooltip title="下载">
            <Button
              size="small" icon={<CloudDownloadOutlined />}
              disabled={row.status !== 'success'}
              onClick={() => window.open('/api/backups/download?id=' + row.id, '_blank')}
            />
          </Tooltip>
          <Tooltip title="恢复到该备份">
            <Button
              size="small" icon={<UndoOutlined />} danger type="text"
              disabled={row.status !== 'success'}
              onClick={() => { setRestoreTarget(row); setRestoreText(''); }}
            />
          </Tooltip>
          <Popconfirm title="确定删除这个备份？" description="文件与记录都会被删除" onConfirm={() => remove(row)}>
            <Button size="small" icon={<DeleteOutlined />} type="text" loading={busy === 'delete-' + row.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ], [busy, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: 16 }}>
      <Title level={4} style={{ marginTop: 0 }}><DatabaseOutlined /> 数据备份</Title>
      <Text type="secondary">
        备份内容包含数据库、上传的图片/文件与备份配置；恢复会用备份覆盖当前数据，操作前系统会自动再做一次安全备份。
      </Text>

      <Card style={{ marginTop: 16 }} title={<span><SafetyCertificateOutlined /> 自动备份策略</span>}>
        <Form form={configForm} layout="vertical">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <Form.Item name="autoBackupEnabled" label="自动备份" valuePropName="checked" style={{ minWidth: 140 }}>
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
            <Form.Item name="schedulePreset" label="执行频率" style={{ minWidth: 200 }}>
              <Select options={SCHEDULE_OPTIONS} />
            </Form.Item>
            {schedulePreset === 'custom' && (
              <Form.Item
                name="backupSchedule" label="Cron 表达式" style={{ minWidth: 200 }}
                rules={[{ required: true, message: '请填写 cron 表达式' }]}
                extra="五段格式：分 时 日 月 周，例如 0 2 * * * 表示每天 02:00"
              >
                <Input placeholder="0 2 * * *" />
              </Form.Item>
            )}
            <Form.Item
              name="backupRetentionDays" label="保留天数" style={{ minWidth: 160 }}
              rules={[{ required: true, message: '请填写保留天数' }]}
              extra="超过该天数的备份会自动删除"
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label=" ">
              <Button type="primary" loading={busy === 'config'} onClick={saveConfig}>保存策略</Button>
            </Form.Item>
          </div>
        </Form>

        {config && (
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 8 }}>
            <Descriptions.Item label="上次备份">
              {config.lastRunAt ? dayjs(config.lastRunAt).format('YYYY-MM-DD HH:mm:ss') : '还没有备份过'}
            </Descriptions.Item>
            <Descriptions.Item label="下次计划">
              {config.nextRunAt ? dayjs(config.nextRunAt).format('YYYY-MM-DD HH:mm:ss') : (config.autoBackupEnabled ? '按 Cron 规则执行' : '未开启')}
            </Descriptions.Item>
            <Descriptions.Item label="保留策略">{config.backupRetentionDays} 天</Descriptions.Item>
            <Descriptions.Item label="备份目录" span={2}><Text copyable style={{ fontSize: 12 }}>{config.backupDir}</Text></Descriptions.Item>
            <Descriptions.Item label="占用 / 磁盘剩余">
              {humanSize(config.totalSizeBytes)} / {config.diskFreeGb} GB
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card style={{ marginTop: 16 }} title={<span><CloudDownloadOutlined /> 立即备份</span>}>
        <Space wrap align="end">
          <Form form={actionForm} layout="inline" component={false}>
            <Form.Item name="kind" label="备份内容" initialValue="full" style={{ marginRight: 12 }}>
              <Select style={{ width: 160 }} options={[
                { label: '完整（库+文件）', value: 'full' },
                { label: '仅数据库', value: 'database' },
                { label: '仅文件', value: 'files' },
              ]} />
            </Form.Item>
            <Form.Item name="note" label="备注" style={{ marginRight: 12 }}>
              <Input placeholder="可选，例如：上线前备份" style={{ width: 220 }} maxLength={200} />
            </Form.Item>
          </Form>
          <Button type="primary" icon={<CloudDownloadOutlined />} loading={busy === 'create'} onClick={createBackup}>
            {busy === 'create' ? '备份中…' : '立即备份'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => load(page, pageSize)} loading={loading}>刷新</Button>
        </Space>
        {busy === 'create' && (
          <Alert style={{ marginTop: 12 }} type="info" showIcon message="正在打包数据库与文件，通常 10–60 秒，请勿关闭页面。" />
        )}
      </Card>

      <Card style={{ marginTop: 16 }} title="备份记录">
        <Table
          rowKey="id"
          size="small"
          columns={columns as any}
          dataSource={items}
          loading={loading}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description="还没有备份，点上方「立即备份」" /> }}
          pagination={{
            current: page, pageSize, total, showSizeChanger: true,
            showTotal: (t) => '共 ' + t + ' 条',
            onChange: (p, ps) => { setPage(p); setPageSize(ps); load(p, ps); },
          }}
        />
      </Card>

      <Modal
        title="从备份恢复数据"
        open={!!restoreTarget}
        onCancel={() => { setRestoreTarget(null); setRestoreText(''); }}
        onOk={doRestore}
        okText="确认恢复"
        okButtonProps={{ danger: true, loading: busy === 'restore', disabled: restoreText.trim().toUpperCase() !== 'RESTORE' }}
        destroyOnClose
      >
        <Alert
          type="warning" showIcon style={{ marginBottom: 12 }}
          message="恢复会用该备份覆盖当前数据库与上传文件"
          description="恢复前系统会自动创建一次「安全备份」；恢复期间请勿关闭页面，完成后需要刷新浏览器。"
        />
        {restoreTarget && (
          <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="备份文件">{restoreTarget.fileName}</Descriptions.Item>
            <Descriptions.Item label="备份时间">{dayjs(restoreTarget.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
            <Descriptions.Item label="大小">{humanSize(restoreTarget.sizeBytes)}</Descriptions.Item>
          </Descriptions>
        )}
        <Text>请输入 <Text strong>RESTORE</Text> 确认：</Text>
        <Input
          style={{ marginTop: 8 }}
          value={restoreText}
          onChange={(e) => setRestoreText(e.target.value)}
          placeholder="RESTORE"
        />
      </Modal>
    </div>
  );
}
