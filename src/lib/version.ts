import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

/**
 * 版本与更新检查（v1.2.7）
 *
 * 本地版本唯一来源是 package.json.version。
 * 远端是独立的「更新中心」（默认 127.0.0.1:9958 / https://update.yuejiaxin.ln.cn）。
 *
 * v1.2.7 起支持双通道：
 *   stable（主版本）—— 生产设备默认收到的版本；
 *   beta（测试版）  —— 只有把本机通道切到 beta 的设备才会收到，用于小范围验证。
 * 两种通道都能拿到「每个版本做了什么」的说明，前端按版本逐条展示，由用户自己选。
 */

export type Channel = 'stable' | 'beta';

export type ReleaseItem = {
  version: string;
  channel: Channel;
  notes: string;
  releasedAt: number | null;
  size: number | null;
  /** 比当前运行版本新（可以直接更新上去） */
  isNewer: boolean;
  /** 就是当前运行的版本 */
  isCurrent: boolean;
};

export type UpdateInfo = {
  local: string;
  /** 当前设备订阅的通道 */
  channel: Channel;
  remote: string | null;
  hasUpdate: boolean;
  notes: string;
  releasedAt: number | null;
  size: number | null;
  sha256: string | null;
  /** 下载直链（内部用：更新脚本测速选最快；不在前台展示） */
  sources: string[];
  /** 当前运行版本的更新说明 */
  localNotes: string;
  localReleasedAt: number | null;
  /** 可更新版本列表（含说明），按版本号倒序，前端逐条展示 */
  releases: ReleaseItem[];
  /** 两条通道各自的最新版本号，用于前端切换时显示 */
  channels: { stable: string | null; beta: string | null };
  checkedAt: number;
  hubReachable: boolean;
  error?: string;
};

const CACHE_TTL_MS = 60 * 1000;
const CHANNEL_KEY = 'updateChannel';

type Cache = { at: number; value: UpdateInfo };
const globalForVersion = globalThis as unknown as { __cwVersionCache?: Cache };

export function getLocalVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return process.env.APP_VERSION || '0.0.0';
  }
}

/** 只按 x.y.z 三段数字比较 */
export function compareVersion(a: string, b: string): number {
  const norm = (v: string) => String(v || '0').split(/[.+-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
  const x = norm(a);
  const y = norm(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] > y[i]) return 1;
    if (x[i] < y[i]) return -1;
  }
  return 0;
}

function hubUrls(): string[] {
  return String(process.env.UPDATE_HUB_URL || 'http://127.0.0.1:9958')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

async function pickHub(): Promise<string | null> {
  for (const base of hubUrls()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(base + '/healthz', { signal: controller.signal, cache: 'no-store' });
      if (res.ok) return base;
    } catch { /* 试下一个 */ } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** 读取本机订阅的通道；没配过就是 stable */
export async function getChannel(): Promise<Channel> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { category_colKey: { category: 'update', colKey: CHANNEL_KEY } },
      select: { value: true },
    });
    return row?.value === 'beta' ? 'beta' : 'stable';
  } catch {
    return 'stable';
  }
}

export async function setChannel(channel: Channel): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { category_colKey: { category: 'update', colKey: CHANNEL_KEY } },
    update: { value: channel },
    create: { category: 'update', colKey: CHANNEL_KEY, value: channel },
  });
  globalForVersion.__cwVersionCache = undefined;
}

export async function checkUpdate(opts?: { force?: boolean; channel?: Channel }): Promise<UpdateInfo> {
  const local = getLocalVersion();
  const forcedChannel = opts?.channel;
  const channel: Channel = forcedChannel || (await getChannel());

  const cached = globalForVersion.__cwVersionCache;
  if (!opts?.force && !forcedChannel && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const empty: UpdateInfo = {
    local,
    channel,
    remote: null,
    hasUpdate: false,
    notes: '',
    releasedAt: null,
    size: null,
    sha256: null,
    sources: [],
    localNotes: '',
    localReleasedAt: null,
    releases: [],
    channels: { stable: null, beta: null },
    checkedAt: Date.now(),
    hubReachable: false,
  };

  const hub = await pickHub();
  if (!hub) {
    const info: UpdateInfo = { ...empty, error: '无法访问远端服务器' };
    globalForVersion.__cwVersionCache = { at: Date.now(), value: info };
    return info;
  }

  try {
    // 1) 当前通道的最新版（决定「有没有更新」）
    const vres = await fetch(hub + '/api/version?channel=' + channel, { cache: 'no-store' });
    if (!vres.ok) throw new Error('远端返回 ' + vres.status);
    const latest = await vres.json();

    // 2) 全量版本历史（决定「每个版本做了什么」）
    const rres = await fetch(hub + '/api/releases', { cache: 'no-store' });
    const all: any[] = rres.ok ? ((await rres.json())?.releases || []) : [];

    const visible = all
      .filter((r) => {
        const ch = r.channel === 'beta' ? 'beta' : 'stable';
        // 稳定通道只看到稳定版；测试通道能看到稳定版和测试版
        return channel === 'beta' ? true : ch === 'stable';
      })
      .map<ReleaseItem>((r) => ({
        version: String(r.version),
        channel: r.channel === 'beta' ? 'beta' : 'stable',
        notes: String(r.notes || ''),
        releasedAt: r.releasedAt ? Number(r.releasedAt) : null,
        size: r.size ? Number(r.size) : null,
        isNewer: compareVersion(String(r.version), local) > 0,
        isCurrent: String(r.version) === local,
      }))
      .sort((a, b) => compareVersion(b.version, a.version));

    const self = visible.find((r) => r.isCurrent);
    const remote = latest?.version ? String(latest.version) : null;

    const info: UpdateInfo = {
      ...empty,
      remote,
      hasUpdate: !!remote && compareVersion(remote, local) > 0,
      notes: String(latest?.notes || ''),
      releasedAt: latest?.releasedAt ? Number(latest.releasedAt) : null,
      size: latest?.size ? Number(latest.size) : null,
      sha256: latest?.sha256 ? String(latest.sha256) : null,
      sources: Array.isArray(latest?.sources) ? latest.sources.map((s: any) => String(s)) : [],
      localNotes: self?.notes || '',
      localReleasedAt: self?.releasedAt || null,
      releases: visible,
      channels: {
        stable: latest?.channels?.stable ? String(latest.channels.stable) : null,
        beta: latest?.channels?.beta ? String(latest.channels.beta) : null,
      },
      hubReachable: true,
    };
    globalForVersion.__cwVersionCache = { at: Date.now(), value: info };
    return info;
  } catch (e: any) {
    const info: UpdateInfo = { ...empty, error: '无法访问远端服务器' };
    globalForVersion.__cwVersionCache = { at: Date.now(), value: info };
    return info;
  }
}
