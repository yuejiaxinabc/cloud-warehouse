import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { handleApiError, errorResponse, successResponse } from '@/lib/errors';
import { z } from 'zod';
import {
  BACKUP_DIR, createBackup, deleteBackup, pruneBackups, readBackupConfig, restoreBackup, backupStats,
} from '@/lib/backup';

/** 数据备份（v1.2.4）：仅管理员可读可写，所有动作写审计 */

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    kind: z.enum(['full', 'database', 'files']).default('full'),
    note: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal('restore'), id: z.coerce.number().int().positive() }),
  z.object({ action: z.literal('delete'), id: z.coerce.number().int().positive() }),
  z.object({
    action: z.literal('save-config'),
    autoBackupEnabled: z.boolean(),
    backupSchedule: z.string().max(64),
    backupRetentionDays: z.coerce.number().int().min(1).max(365),
  }),
  z.object({ action: z.literal('prune') }),
]);

function scheduleLabel(s: string) {
  if (s === 'hourly') return '每小时';
  if (s === 'daily') return '每天';
  if (s === 'weekly') return '每周';
  return s;
}

function nextRunAt(schedule: string, lastRunAt: string | null) {
  const base = lastRunAt ? new Date(lastRunAt).getTime() : Date.now();
  const fixed: Record<string, number> = { hourly: 3600000, daily: 86400000, weekly: 604800000 };
  if (fixed[schedule]) return new Date(base + fixed[schedule]).toISOString();
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams;
    const { page, pageSize } = pageSchema.parse({
      page: q.get('page') || 1,
      pageSize: q.get('pageSize') || 20,
    });

    const [rows, total, config, stats] = await Promise.all([
      prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.backupRecord.count(),
      readBackupConfig(),
      backupStats(),
    ]);

    const diskFreeGb = await (async () => {
      try {
        const { statfs } = await import('node:fs/promises');
        const s: any = await statfs(BACKUP_DIR).catch(() => null);
        if (!s) return 0;
        return Number(((Number(s.bavail) * Number(s.bsize)) / 1073741824).toFixed(1));
      } catch { return 0; }
    })();

    return successResponse({
      items: rows.map((r) => ({
        id: Number(r.id),
        fileName: r.fileName,
        kind: r.kind,
        status: r.status,
        sizeBytes: Number(r.sizeBytes),
        durationMs: r.durationMs,
        checksum: r.checksum,
        note: r.note,
        error: r.error,
        trigger: r.trigger,
        createdByName: r.createdByName,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      config: {
        autoBackupEnabled: config.autoBackupEnabled,
        backupSchedule: config.backupSchedule,
        backupScheduleLabel: scheduleLabel(config.backupSchedule),
        backupRetentionDays: config.backupRetentionDays,
        lastRunAt: config.lastRunAt,
        nextRunAt: config.autoBackupEnabled ? nextRunAt(config.backupSchedule, config.lastRunAt) : null,
        backupDir: BACKUP_DIR,
        diskFreeGb,
        totalSizeBytes: stats.dirBytes,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const actor = {
      id: Number((session.user as any)?.id) || null,
      name: (session.user as any)?.name || (session.user as any)?.username || null,
    };
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return errorResponse('参数不合法：' + parsed.error.issues.map((i) => i.message).join('；'), 400);
    const body = parsed.data;

    if (body.action === 'create') {
      const result = await createBackup({ kind: body.kind, note: body.note, trigger: 'manual', actor });
      return successResponse(result, '备份完成：' + result.fileName);
    }

    if (body.action === 'restore') {
      const result = await restoreBackup(body.id, actor);
      return successResponse(result, '已从 ' + result.restored + ' 恢复，恢复前的数据已备份为 ' + result.safety);
    }

    if (body.action === 'delete') {
      await deleteBackup(body.id, actor);
      return successResponse(null, '备份已删除');
    }

    if (body.action === 'prune') {
      const result = await pruneBackups();
      return successResponse(result, '已按保留策略清理 ' + result.removed + ' 个过期备份');
    }

    // save-config
    const upsert = async (colKey: string, value: string) => {
      await prisma.systemConfig.upsert({
        where: { category_colKey: { category: 'system', colKey } },
        update: { value },
        create: { category: 'system', colKey, value },
      });
    };
    await Promise.all([
      upsert('autoBackupEnabled', body.autoBackupEnabled ? 'true' : 'false'),
      upsert('backupSchedule', body.backupSchedule),
      upsert('backupRetentionDays', String(body.backupRetentionDays)),
    ]);
    return successResponse(null, '备份策略已保存');
  } catch (error) {
    return handleApiError(error);
  }
}
