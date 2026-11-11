import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from './prisma';
import { writeLog } from './log';

const execFileAsync = promisify(execFile);

/**
 * 数据备份与回滚（1.2.4 新增）
 *
 * 备份内容：数据库全量 dump + public/uploads 文件 + 备份配置快照，打成一个 .tar.gz。
 * 存放位置：BACKUP_DIR（默认 <项目根>/backups），不在 public 下，避免被静态服务直接下载。
 * 调度：instrumentation 里的定时器每 60 秒检查一次，按 SystemConfig 的
 *       autoBackupEnabled / backupSchedule / backupRetentionDays 执行。
 * 保留：默认 30 天，超期自动删除文件与记录；始终保留最近一次成功备份，避免删到无法恢复。
 */

export type BackupKind = 'full' | 'database' | 'files';

export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

const CFG = {
  enabled: 'autoBackupEnabled',
  schedule: 'backupSchedule',
  retention: 'backupRetentionDays',
  lastRun: 'backupLastRunAt',
};

function dbConn() {
  const raw = String(process.env.DATABASE_URL || '');
  const url = new URL(raw.replace(/^mysql:/, 'http://'));
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '3306',
    user: decodeURIComponent(url.username || 'root'),
    password: decodeURIComponent(url.password || ''),
    database: (url.pathname || '/warehouse').replace(/^\//, '').split('?')[0],
  };
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [] as any[]);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += (await fsp.stat(full).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

function pad2(n: number) {
  return (n < 10 ? '0' : '') + n;
}

function stamp() {
  const d = new Date();
  return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}

/** 读取备份配置（SystemConfig 里全部以字符串存储） */
export async function readBackupConfig() {
  const rows = await prisma.systemConfig.findMany({ where: { category: 'system' } });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.colKey] = row.value || '';
  const retention = Number(map[CFG.retention] || 30);
  return {
    autoBackupEnabled: map[CFG.enabled] === 'true',
    backupSchedule: map[CFG.schedule] || 'daily',
    backupRetentionDays: Number.isFinite(retention) && retention > 0 ? Math.min(365, Math.floor(retention)) : 30,
    lastRunAt: map[CFG.lastRun] || null,
  };
}

async function setConfig(colKey: string, value: string) {
  await prisma.systemConfig.upsert({
    where: { category_colKey: { category: 'system', colKey } },
    update: { value },
    create: { category: 'system', colKey, value },
  });
}

/** 创建备份：先落 running 记录，成功/失败再更新，前端可据此看到状态与失败原因 */
export async function createBackup(opts: {
  kind?: BackupKind;
  note?: string;
  trigger?: 'manual' | 'schedule';
  actor?: { id?: number | null; name?: string | null };
}) {
  const kind: BackupKind = opts.kind || 'full';
  const started = Date.now();
  // 文件名带毫秒 + 4 位随机后缀：同一秒内连续备份（例如「恢复前安全备份」紧接着手动备份）不会撞唯一键
  const name = 'yuncang-' + kind + '-' + stamp() + '-' + String(new Date().getMilliseconds()).padStart(3, '0') +
    crypto.randomBytes(2).toString('hex') + '.tar.gz';
  const filePath = path.join(BACKUP_DIR, name);

  await ensureDir(BACKUP_DIR);
  const record = await prisma.backupRecord.create({
    data: {
      fileName: name,
      kind,
      status: 'running',
      note: opts.note || null,
      createdBy: opts.actor && opts.actor.id ? BigInt(opts.actor.id) : null,
      createdByName: (opts.actor && opts.actor.name) || null,
      trigger: opts.trigger || 'manual',
    },
  });

  const work = await fsp.mkdtemp(path.join(BACKUP_DIR, '.work-'));
  try {
    if (kind === 'full' || kind === 'database') {
      const c = dbConn();
      const args = [
        '--single-transaction', '--quick', '--no-tablespaces', '--add-drop-table',
        '--routines', '--triggers', '--hex-blob', '--set-gtid-purged=OFF',
        '-h', c.host, '-P', String(c.port), '-u', c.user, c.database,
      ];
      const result = await execFileAsync('mysqldump', args, {
        env: Object.assign({}, process.env, { MYSQL_PWD: c.password }),
        maxBuffer: 1024 * 1024 * 512,
        encoding: 'buffer',
      } as any);
      await fsp.writeFile(path.join(work, 'database.sql'), (result as any).stdout, { mode: 0o600 });
    }

    if (kind === 'full' || kind === 'files') {
      const publicDir = path.join(process.cwd(), 'public');
      if (fs.existsSync(path.join(publicDir, 'uploads'))) {
        await execFileAsync('tar', ['-C', publicDir, '-czf', path.join(work, 'uploads.tar.gz'), 'uploads']);
      }
    }

    const cfg = await readBackupConfig();
    const systemRows = await prisma.systemConfig.findMany({ where: { category: 'system' } });
    const meta = {
      createdAt: new Date().toISOString(),
      kind,
      database: dbConn().database,
      config: cfg,
      systemConfig: systemRows.map((r) => ({ key: r.colKey, value: r.value })),
      note: opts.note || null,
    };
    await fsp.writeFile(path.join(work, 'meta.json'), JSON.stringify(meta, null, 2), { mode: 0o600 });

    await execFileAsync('tar', ['-C', work, '-czf', filePath, '.']);
    await fsp.chmod(filePath, 0o600);

    const size = (await fsp.stat(filePath)).size;
    const checksum = await sha256(filePath);
    const durationMs = Date.now() - started;

    await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: 'success', sizeBytes: BigInt(size), durationMs, checksum },
    });
    await setConfig(CFG.lastRun, new Date().toISOString());
    await writeLog({
      module: 'system',
      action: 'backup_create',
      userId: opts.actor && opts.actor.id ? opts.actor.id : undefined,
      content: '创建备份 ' + name + '（' + (size / 1048576).toFixed(2) + ' MB，' + durationMs + ' ms）',
      refType: 'backup',
      refId: record.id,
    });

    return { id: Number(record.id), fileName: name, sizeBytes: size, durationMs, checksum };
  } catch (error: any) {
    const message = String((error && error.message) || error).slice(0, 480);
    await fsp.rm(filePath, { force: true }).catch(() => {});
    await prisma.backupRecord.update({
      where: { id: record.id },
      data: { status: 'failed', error: message, durationMs: Date.now() - started },
    });
    await writeLog({
      module: 'system',
      action: 'backup_failed',
      userId: opts.actor && opts.actor.id ? opts.actor.id : undefined,
      content: ('备份失败 ' + name + '：' + message).slice(0, 480),
      refType: 'backup',
      refId: record.id,
    });
    throw new Error('备份失败：' + message);
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

/** 恢复：先用当前数据做一次安全备份，再覆盖数据库与上传文件 */
export async function restoreBackup(id: number, actor?: { id?: number | null; name?: string | null }) {
  const record = await prisma.backupRecord.findUnique({ where: { id: BigInt(id) } });
  if (!record || record.status !== 'success') throw new Error('备份不存在或未成功完成');
  const filePath = path.join(BACKUP_DIR, record.fileName);
  if (!fs.existsSync(filePath)) throw new Error('备份文件已丢失，无法恢复');

  const safety = await createBackup({
    kind: 'full',
    note: '恢复 ' + record.fileName + ' 之前的自动安全备份',
    trigger: 'manual',
    actor,
  });

  const work = await fsp.mkdtemp(path.join(BACKUP_DIR, '.restore-'));
  try {
    await execFileAsync('tar', ['-C', work, '-xzf', filePath]);

    const sqlPath = path.join(work, 'database.sql');
    if (fs.existsSync(sqlPath)) {
      const c = dbConn();
      const sql = await fsp.readFile(sqlPath);
      await new Promise<void>((resolve, reject) => {
        const child = execFile('mysql', ['-h', c.host, '-P', String(c.port), '-u', c.user, c.database], {
          env: Object.assign({}, process.env, { MYSQL_PWD: c.password }),
          maxBuffer: 1024 * 1024 * 512,
        }, (err) => {
          if (err) reject(new Error('数据库恢复失败：' + err.message));
          else resolve();
        });
        child.stdin && child.stdin.end(sql);
      });
    }

    const uploadsTar = path.join(work, 'uploads.tar.gz');
    if (fs.existsSync(uploadsTar)) {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await fsp.mkdir(uploadsDir, { recursive: true });
      const old = await fsp.readdir(uploadsDir).catch(() => [] as string[]);
      for (const f of old) await fsp.rm(path.join(uploadsDir, f), { recursive: true, force: true });
      await execFileAsync('tar', ['-C', path.join(process.cwd(), 'public'), '-xzf', uploadsTar]);
    }

    // 恢复会把 backup_records 一起回滚：把「恢复期间残留的 running 记录」标记为失效，
    // 避免列表里出现永远「进行中」的僵尸行。
    await prisma.backupRecord.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', error: '备份表已被本次恢复覆盖，该记录已失效' },
    }).catch(() => {});

    await writeLog({
      module: 'system',
      action: 'backup_restore',
      userId: actor && actor.id ? actor.id : undefined,
      content: '从备份 ' + record.fileName + ' 恢复数据（恢复前已自动备份 ' + safety.fileName + '）',
      refType: 'backup',
      refId: record.id,
    });
    return { restored: record.fileName, safety: safety.fileName };
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

export async function deleteBackup(id: number, actor?: { id?: number | null }) {
  const record = await prisma.backupRecord.findUnique({ where: { id: BigInt(id) } });
  if (!record) throw new Error('备份不存在');
  await fsp.rm(path.join(BACKUP_DIR, record.fileName), { force: true }).catch(() => {});
  await prisma.backupRecord.delete({ where: { id: BigInt(id) } });
  await writeLog({
    module: 'system',
    action: 'backup_delete',
    userId: actor && actor.id ? actor.id : undefined,
    content: '删除备份 ' + record.fileName,
    refType: 'backup',
    refId: BigInt(id),
  });
}

/** 按保留天数清理过期备份；始终保留最近一次成功备份 */
export async function pruneBackups() {
  const cfg = await readBackupConfig();
  const cutoff = new Date(Date.now() - cfg.backupRetentionDays * 86400000);
  const expired = await prisma.backupRecord.findMany({
    where: { createdAt: { lt: cutoff }, status: 'success' },
    orderBy: { createdAt: 'desc' },
  });
  const keepOne = expired.shift();
  let removed = 0;
  for (const row of expired) {
    await fsp.rm(path.join(BACKUP_DIR, row.fileName), { force: true }).catch(() => {});
    await prisma.backupRecord.delete({ where: { id: row.id } }).catch(() => {});
    removed += 1;
  }
  if (removed > 0) {
    await writeLog({
      module: 'system',
      action: 'backup_prune',
      content: '按保留策略（' + cfg.backupRetentionDays + ' 天）清理 ' + removed + ' 个过期备份' +
        (keepOne ? '，保留最近一次 ' + keepOne.fileName : ''),
    });
  }
  return { removed, retentionDays: cfg.backupRetentionDays };
}

/** 计划是否到点：支持 hourly / daily / weekly 与五段 cron 的最小子集 */
function isDue(schedule: string, lastRunAt: string | null): boolean {
  const last = lastRunAt ? new Date(lastRunAt).getTime() : 0;
  const now = new Date();
  const fixed: Record<string, number> = { hourly: 3600000, daily: 86400000, weekly: 604800000 };
  if (fixed[schedule]) return Date.now() - last >= fixed[schedule];

  const parts = String(schedule || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  if (Number(parts[0]) !== now.getMinutes() || Number(parts[1]) !== now.getHours()) return false;
  return Date.now() - last > 60000;
}

/** 调度入口：instrumentation 每 60 秒调一次 */
export async function runScheduledBackup(): Promise<{ ran: boolean; reason?: string }> {
  const cfg = await readBackupConfig();
  if (!cfg.autoBackupEnabled) return { ran: false, reason: 'disabled' };
  if (!isDue(cfg.backupSchedule, cfg.lastRunAt)) return { ran: false, reason: 'not-due' };

  if (cfg.lastRunAt) {
    const guard = await prisma.systemConfig.updateMany({
      where: { category: 'system', colKey: CFG.lastRun, value: cfg.lastRunAt },
      data: { value: new Date().toISOString() },
    });
    if (guard.count === 0) return { ran: false, reason: 'locked' };
  } else {
    await setConfig(CFG.lastRun, new Date().toISOString());
  }

  try {
    await createBackup({ kind: 'full', trigger: 'schedule', note: '定时自动备份' });
    await pruneBackups();
    return { ran: true };
  } catch (error: any) {
    console.error('[backup] 定时备份失败：', (error && error.message) || error);
    return { ran: false, reason: 'failed' };
  }
}

export async function backupStats() {
  const [total, lastSuccess] = await Promise.all([
    prisma.backupRecord.count(),
    prisma.backupRecord.findFirst({ where: { status: 'success' }, orderBy: { createdAt: 'desc' } }),
  ]);
  const bytes = await dirSize(BACKUP_DIR).catch(() => 0);
  return { total, lastSuccessAt: lastSuccess ? lastSuccess.createdAt : null, dirBytes: bytes, dir: BACKUP_DIR };
}
