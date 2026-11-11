import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth-guard';
import { handleApiError, errorResponse } from '@/lib/errors';
import { checkUpdate } from '@/lib/version';

/**
 * 系统自更新（v1.2.5）
 *
 * POST /api/system/update  → 启动更新（仅 admin），立即返回 jobId
 * GET  /api/system/update  → 读最近一次更新的实时日志与状态
 *
 * 真正的动作在 scripts/apply-update.sh 里：下载 → 校验 → 覆盖代码 → 构建 → 切换 → 重启，
 * 失败自动回滚。这里只负责起进程、落日志，避免把长任务挂在请求线程上。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WORK_DIR = process.env.UPDATE_WORK_DIR || '/opt/cw-update-work';
const LOG_FILE = path.join(WORK_DIR, 'last-run.log');
const STATE_FILE = path.join(WORK_DIR, 'last-run.json');

function isAdmin(auth: any) {
  return Array.isArray(auth?.user?.roles) && auth.user.roles.includes('admin');
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!isAdmin(auth)) return errorResponse('权限不足', 403);
    let log = '';
    let state: any = null;
    try { log = fs.readFileSync(LOG_FILE, 'utf8').slice(-20000); } catch {}
    try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
    return NextResponse.json({ success: true, data: { state, log } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!isAdmin(auth)) return errorResponse('权限不足，仅管理员可执行更新', 403);

    const body = await req.json().catch(() => ({} as any));
    const info = await checkUpdate({ force: true });
    if (!info.hubReachable) return errorResponse('连不上更新中心：' + (info.error || ''), 503);
    if (!info.remote) return errorResponse('更新中心还没有发布任何版本', 400);
    // 允许更新到指定版本（用户在多版本列表里自己选），也保留「更新到通道最新」的默认行为
    const wanted = String(body?.version || info.remote || '').trim();
    const known = (info.releases || []).find((r) => r.version === wanted);
    if (!known) {
      return errorResponse('更新中心里没有 v' + wanted + ' 这个版本', 400);
    }
    if (!known.isNewer && !body?.force) {
      return errorResponse('v' + wanted + ' 不比当前版本 ' + info.local + ' 新，无需更新', 400);
    }

    if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });
    const target = wanted;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ status: 'running', version: target, from: info.local, startedAt: Date.now(), operator: String((auth.user as any)?.username || '') }, null, 2));

    const script = path.join(process.cwd(), 'scripts', 'apply-update.sh');
    if (!fs.existsSync(script)) return errorResponse('更新脚本缺失：scripts/apply-update.sh', 500);

    // 关键：不能用普通 spawn。
    // 更新脚本最后会 systemctl restart cloud-warehouse，而 systemd 默认按 cgroup 杀进程，
    // 应用子进程（包括我们 spawn 出来的脚本）会在重启瞬间被一起杀掉——
    // 第一次实测就是脚本死在 restart 那一步，状态永远停在 running。
    // 用 systemd-run 起一个独立的 transient unit，脚本就脱离应用的 cgroup，
    // 重启应用不会波及它自己。
    try { fs.unlinkSync(LOG_FILE); } catch {}
    const unit = 'cw-update-' + Date.now();
    const child = spawn('systemd-run', [
      '--unit=' + unit,
      '--collect',
      '--property=Type=oneshot',
      '--property=WorkingDirectory=' + process.cwd(),
      '--property=StandardOutput=append:' + LOG_FILE,
      '--property=StandardError=append:' + LOG_FILE,
      '/bin/bash', script, target,
    ], { detached: true, stdio: 'ignore', env: { ...process.env } });
    child.unref();

    return NextResponse.json({ success: true, data: { started: true, target, from: info.local, logFile: LOG_FILE } });
  } catch (error) {
    return handleApiError(error);
  }
}
