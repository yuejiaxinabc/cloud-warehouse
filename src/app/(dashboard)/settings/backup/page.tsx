'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Tag, Alert, Space, message, Typography, Spin, Popconfirm, Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SafetyCertificateOutlined, SaveOutlined, RollbackOutlined, ReloadOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface BackupItem {
  filename: string;
  date: string | null;
  size: number;
  mtime: string;
}
interface IntegrityReport {
  ok?: boolean;
  tampered?: number;
  checked?: number;
  timestamp?: string;
  [k: string]: any;
}

function fmtSize(b: number) {
  if (!b) return '0 MB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

export default function BackupPage() {
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backup', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.success) {
        setBackups(data.data?.backups || []);
        setIntegrity(data.data?.integrity || null);
      } else {
        message.error(data.error || '加载失败');
      }
    } catch {
      message.error('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedFilename = selected
    ? backups.find((b) => b.date === selected)?.filename || ''
    : '';

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (data.success) {
        message.success('备份已触发并完成');
        await load();
      } else {
        message.error(data.error || '备份失败');
      }
    } catch {
      message.error('网络错误，请稍后重试');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!selected) {
      message.warning('请先在下方列表中选择要回滚的备份');
      return;
    }
    setRestoring(true);
    try {
      const res = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selected }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(`已回滚到 ${selected} 的备份`);
        setSelected(null);
        await load();
      } else {
        message.error(data.error || '回滚失败');
      }
    } catch {
      message.error('网络错误，请稍后重试');
    } finally {
      setRestoring(false);
    }
  };

  const columns: ColumnsType<BackupItem> = [
    { title: '备份日期', dataIndex: 'date', width: 140, render: (d) => d || '-' },
    { title: '文件名', dataIndex: 'filename', ellipsis: true },
    { title: '大小', dataIndex: 'size', width: 120, render: (s) => fmtSize(s) },
    {
      title: '生成时间',
      dataIndex: 'mtime',
      width: 180,
      render: (m) => new Date(m).toLocaleString('zh-CN'),
    },
  ];

  const integrityNode =
    integrity && (!integrity.ok || integrity.tampered !== undefined) ? (
      <Alert
        type={integrity.ok ? 'success' : 'error'}
        showIcon
        message={integrity.ok ? '数据完整性校验通过（哈希链）' : '检测到数据异常，请立即核查'}
        description={
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div>
              校验时间：
              {integrity.timestamp
                ? new Date(integrity.timestamp).toLocaleString('zh-CN')
                : '未知'}
            </div>
            <div>
              已校验：{integrity.checked ?? '—'} 条，疑似篡改：
              <Text type={integrity.tampered ? 'danger' : 'secondary'}>
                {integrity.tampered ?? '—'}
              </Text>{' '}
              条
            </div>
          </div>
        }
      />
    ) : (
      <Alert type="info" showIcon message="暂无完整性报告（每日 02:00 自动校验后生成）" />
    );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        <SafetyCertificateOutlined /> 数据备份与回滚
      </Typography.Title>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            系统每日 02:05 自动备份（保留最近 31 天），并每日 02:00 进行哈希链防篡改校验。
            你可在下方手动触发一次备份，或选择任一历史备份执行回滚。回滚前会自动生成当前数据快照，可再次回滚。
          </Paragraph>
          {integrityNode}
        </Space>
      </Card>

      <Card
        title="备份列表（按日期选择）"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleBackup}
              loading={backingUp}
            >
              立即备份
            </Button>
          </Space>
        }
      >
        <Table<BackupItem>
          rowKey="filename"
          loading={loading}
          columns={columns}
          dataSource={backups}
          pagination={false}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedFilename ? [selectedFilename] : [],
            onChange: (keys) => {
              const f = keys[0] as string;
              const item = backups.find((b) => b.filename === f);
              setSelected(item?.date || null);
            },
          }}
          locale={{ emptyText: '暂无备份文件（本地开发环境或未配置备份目录）' }}
        />
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Popconfirm
            title="确认回滚？"
            description={
              <span>
                将把数据库恢复到 <b>{selected || '—'}</b> 的备份。回滚前会自动生成当前数据快照（可再次回滚），
                但此操作会覆盖当前业务数据，且无法通过界面撤销，请务必确认！
              </span>
            }
            okText="确认回滚"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            disabled={!selected}
            onConfirm={handleRestore}
          >
            <Button danger icon={<RollbackOutlined />} loading={restoring} disabled={!selected}>
              回滚到所选备份
            </Button>
          </Popconfirm>
          {selected ? (
            <Text type="secondary">已选备份日期：{selected}</Text>
          ) : (
            <Tooltip title="在上方列表单选一行以选择备份">
              <Text type="secondary">请先选择要回滚的备份</Text>
            </Tooltip>
          )}
        </div>
      </Card>
    </div>
  );
}
