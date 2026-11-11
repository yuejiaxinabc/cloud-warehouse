'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Progress, Segmented, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloudDownloadOutlined, ReloadOutlined, RocketOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

type Channel = 'stable' | 'beta';

type ReleaseItem = {
  version: string;
  channel: Channel;
  notes: string;
  releasedAt: number | null;
  size: number | null;
  isNewer: boolean;
  isCurrent: boolean;
};

type VersionInfo = {
  local: string;
  channel: Channel;
  remote: string | null;
  hasUpdate: boolean;
  notes: string;
  releasedAt: number | null;
  size: number | null;
  sha256: string | null;
  localNotes: string;
  localReleasedAt: number | null;
  releases: ReleaseItem[];
  channels: { stable: string | null; beta: string | null };
  checkedAt: number;
  hubReachable: boolean;
  error?: string;
};

const fmtTime = (t: number | null) => (t ? new Date(t).toLocaleString('zh-CN') : '-');
const fmtSize = (n: number | null) => (n ? (n / 1048576).toFixed(2) + ' MB' : '-');

/**
 * 设置 → 检查更新（v1.2.7）
 *
 * 交互：
 *  - 顶部可选通道：主版本（stable）/ 测试版（beta），每台设备各存各的；
 *  - 下方按版本逐条列出「这个版本做了什么」，用户自己选要更新到哪一个；
 *  - 没有可更新的版本时，区域显示「当前已是最新版本」。
 */
export default function UpdateTab() {
  const { message, modal } = App.useApp();
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async (force: boolean, channel?: Channel) => {
    if (force) setChecking(true);
    try {
      const qs = new URLSearchParams();
      if (force) qs.set('refresh', '1');
      if (channel) qs.set('channel', channel);
      const res = await fetch('/api/system/version' + (qs.toString() ? '?' + qs.toString() : ''), { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || '读取版本失败');
      setInfo(json.data);
      return json.data as VersionInfo;
    } catch (e: any) {
      message.error(e.message || '读取版本失败');
      return null;
    } finally {
      setChecking(false);
    }
  }, [message]);

  useEffect(() => { load(false); }, [load]);

  const switchChannel = async (ch: Channel) => {
    try {
      const res = await fetch('/api/system/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: ch }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error || '切换失败');
      message.success(json.message || '已切换');
      await load(true, ch);
    } catch (e: any) {
      message.error(e.message || '切换失败');
    }
  };

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/system/update', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return;
      const st = json.data?.state;
      setLog(String(json.data?.log || ''));
      if (st && st.status && st.status !== 'running') {
        setRunning(false);
        clearInterval(timer.current);
        if (st.status === 'success') {
          message.success('更新完成，服务已重启');
          load(true);
        } else {
          message.error('更新失败，已自动回滚到更新前的代码');
        }
      }
    } catch { /* 下次再试 */ }
  }, [load, message]);

  const doUpdate = (version: string) => {
    modal.confirm({
      title: '确认更新到 v' + version + '？',
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.9 }}>
          <div>• 只替换程序代码，<b>数据库不会变更</b>（如包内带增量 SQL，也只执行建表/加字段，不删数据）</div>
          <div>• 更新期间服务会重启，约 1–3 分钟不可用</div>
          <div>• 失败会自动回滚到当前版本 {info?.local}</div>
        </div>
      ),
      okText: '立即更新',
      cancelText: '稍后再看',
      okButtonProps: { danger: true },
      onOk: async () => {
        setRunning(true);
        setTarget(version);
        setLog('正在启动更新…');
        try {
          const res = await fetch('/api/system/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success) throw new Error(json?.error || '启动更新失败');
          message.info('更新已开始，正在下载并构建，请勿关闭页面');
          clearInterval(timer.current);
          timer.current = setInterval(poll, 3000);
        } catch (e: any) {
          setRunning(false);
          message.error(e.message || '启动更新失败');
        }
      },
    });
  };

  useEffect(() => () => clearInterval(timer.current), []);

  const candidates = (info?.releases || []).filter((r) => r.isNewer);

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="更新只替换程序代码，不会动数据库"
        description="每个版本都会写明改了什么，由你决定升到哪个版本。若发布包带数据库脚本，也只执行建表/加字段这类增量语句，删表删列一律被过滤；更新失败会自动回滚。"
      />

      <Card
        title="更新通道"
        extra={<Button icon={<ReloadOutlined />} loading={checking} onClick={async () => {
          const d = await load(true);
          if (!d) return;
          if (!d.hubReachable) { message.error('无法访问远端服务器，请检查服务器网络或更新服务是否正常'); return; }
          message.success((d.releases || []).some((r) => r.isNewer) ? '发现可用更新，见下方列表' : '当前版本为最新版');
        }}>检查更新</Button>}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Segmented
            block
            value={info?.channel || 'stable'}
            onChange={(v) => switchChannel(v as Channel)}
            options={[
              { label: '主版本（稳定）' + (info?.channels?.stable ? '  最新 v' + info.channels.stable : ''), value: 'stable' },
              { label: '测试版（Beta）' + (info?.channels?.beta ? '  最新 v' + info.channels.beta : ''), value: 'beta' },
            ]}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            主版本是所有设备默认收到的正式版本；测试版只在你把这台设备切到 Beta 后才会收到，适合上线前小范围验证。
          </Text>
        </Space>
      </Card>

      <Card title="版本信息" style={{ marginTop: 16 }}>
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="当前版本"><Text strong>v{info?.local || '-'}</Text></Descriptions.Item>
          <Descriptions.Item label="订阅通道">
            <Tag color={info?.channel === 'beta' ? 'orange' : 'blue'}>{info?.channel === 'beta' ? '测试版 Beta' : '主版本'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="远端状态">
            {!info ? <Tag>读取中</Tag>
              : !info.hubReachable ? <Tag color="orange">无法访问远端服务器</Tag>
              : info.hasUpdate ? <Tag color="red">有可用更新</Tag>
              : <Tag color="green">已是最新</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="检查时间">{fmtTime(info?.checkedAt || null)}</Descriptions.Item>
        </Descriptions>

        {!info?.hubReachable && info ? (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message="无法访问远端服务器"
            description="当前无法连接版本服务，暂时不能检查更新。这不影响系统正常使用，请检查服务器出网或稍后重试。"
          />
        ) : null}

        {/* 当前版本做了什么 */}
        <div className="yc-update-block" style={{ marginTop: 16 }}>
          <div className="yc-update-block-head">
            <Text strong>当前版本 v{info?.local || '-'} 更新内容</Text>
            {info?.localReleasedAt ? <Text type="secondary" style={{ fontSize: 12 }}>发布于 {fmtTime(info.localReleasedAt)}</Text> : null}
          </div>
          <Paragraph style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', color: '#475569', fontSize: 13, lineHeight: 1.9 }}>
            {info?.localNotes?.trim() || '该版本未在更新中心登记更新说明。'}
          </Paragraph>
        </div>
      </Card>

      <Card
        title={candidates.length ? '可更新版本（' + candidates.length + '）' : '可更新版本'}
        style={{ marginTop: 16 }}
      >
        {candidates.length ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {candidates.map((r) => (
              <div key={r.version} className="yc-update-block yc-update-block-next">
                <div className="yc-update-block-head">
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 15 }}>v{r.version}</Text>
                    <Tag color={r.channel === 'beta' ? 'orange' : 'blue'}>{r.channel === 'beta' ? '测试版 Beta' : '主版本'}</Tag>
                    {r.version === info?.remote ? <Tag color="red">通道最新</Tag> : null}
                    <Text type="secondary" style={{ fontSize: 12 }}>发布于 {fmtTime(r.releasedAt)} · {fmtSize(r.size)}</Text>
                  </Space>
                  <Button type="primary" danger size="small" icon={<CloudDownloadOutlined />} loading={running && target === r.version} onClick={() => doUpdate(r.version)}>
                    更新到此版本
                  </Button>
                </div>
                <Paragraph style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#475569', fontSize: 13, lineHeight: 1.9 }}>
                  {r.notes?.trim() || '（该版本没有填写更新说明）'}
                </Paragraph>
              </div>
            ))}
          </Space>
        ) : (
          <div className="yc-update-block yc-update-latest">
            <Space size={8}>
              <CheckCircleOutlined style={{ color: '#16A34A' }} />
              <Text strong>当前已是最新版本</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {info?.hubReachable
                  ? (info?.channel === 'beta' ? '测试通道没有比 v' + (info?.local || '') + ' 更新的版本' : '主版本通道没有比 v' + (info?.local || '') + ' 更新的版本')
                  : '远端不可达，无法判断是否有新版本'}
              </Text>
            </Space>
          </div>
        )}
      </Card>

      {(running || log) ? (
        <Card title={'更新进度' + (target ? '（目标 v' + target + '）' : '')} style={{ marginTop: 16 }} size="small">
          {running ? <Progress percent={90} status="active" showInfo={false} style={{ marginBottom: 10 }} /> : null}
          <pre style={{
            margin: 0, maxHeight: 320, overflow: 'auto', background: '#0B1220', color: '#CBD5E1',
            padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.7,
          }}>{log || '等待输出…'}</pre>
        </Card>
      ) : null}
    </div>
  );
}
