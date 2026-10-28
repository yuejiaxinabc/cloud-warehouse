'use client';

import { useCallback, useEffect, useState } from 'react';
import { App, Button, Empty, List, Space, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';

const { Text } = Typography;

async function readJson(res: Response) {
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/**
 * 单据附件面板（v1.3）
 * 用法：<AttachmentPanel module="inbound" refId={orderId} />
 */
export default function AttachmentPanel({ module, refId }: { module: string; refId: string | number }) {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!refId) return;
    setLoading(true);
    try {
      const json = await readJson(await fetch(`/api/attachments?module=${module}&refId=${refId}`, { cache: 'no-store' }));
      if (json?.success) setItems(json.data || []);
    } catch {
      /* 静默，附件不是主流程 */
    } finally {
      setLoading(false);
    }
  }, [module, refId]);

  useEffect(() => { load(); }, [load]);

  const remove = (row: any) => {
    modal.confirm({
      title: '删除这个附件？',
      content: row.fileName,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const json = await readJson(await fetch(`/api/attachments?id=${row.id}`, { method: 'DELETE' }));
        if (json?.success) { message.success('已删除'); load(); }
        else message.error(json?.error || '删除失败');
      },
    });
  };

  return (
    <div>
      <Upload
        name="file"
        action="/api/upload"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        showUploadList={false}
        onChange={async ({ file }) => {
          if (file.status === 'done') {
            const resp: any = file.response || {};
            if (!resp.url) { message.error(resp.error || '上传失败'); return; }
            const json = await readJson(await fetch('/api/attachments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                module,
                refId,
                url: resp.url,
                fileName: file.name,
                mime: file.type,
                size: file.size,
              }),
            }));
            if (json?.success) { message.success('附件已上传'); load(); }
            else message.error(json?.error || '保存失败');
          } else if (file.status === 'error') {
            message.error('上传失败，仅支持图片或 PDF');
          }
        }}
      >
        <Button icon={<UploadOutlined />}>上传附件</Button>
      </Upload>

      <List
        style={{ marginTop: 12 }}
        size="small"
        loading={loading}
        dataSource={items}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有附件" /> }}
        renderItem={(row: any) => (
          <List.Item
            actions={[
              <a key="dl" href={row.url} target="_blank" rel="noreferrer"><DownloadOutlined /> 查看</a>,
              <Button key="rm" type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(row)}>删除</Button>,
            ]}
          >
            <Space>
              <PaperClipOutlined style={{ color: '#94A3B8' }} />
              <Text style={{ fontSize: 13 }}>{row.fileName}</Text>
              {row.size ? <Tag bordered={false}>{Math.round(Number(row.size) / 1024)} KB</Tag> : null}
            </Space>
          </List.Item>
        )}
      />
    </div>
  );
}
