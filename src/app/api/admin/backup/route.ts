import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireAdmin, authErrorResponse } from '@/lib/auth-guard';

const execFileAsync = promisify(execFile);

const BACKUP_DIR = process.env.BACKUP_DIR || '/var/backups/inventory';
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT || '/opt/inventory-system/scripts/backup.sh';
const INTEGRITY_REPORT =
  process.env.INTEGRITY_REPORT_PATH || path.join(BACKUP_DIR, 'integrity_report.json');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    const [backups, integrity] = await Promise.all([listBackups(), readIntegrity()]);
    return NextResponse.json({ success: true, data: { backups, integrity } });
  } catch (e) {
    return authErrorResponse(e);
  }
}

export async function POST() {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const { stdout, stderr } = await execFileAsync('bash', [BACKUP_SCRIPT], {
      timeout: 5 * 60 * 1000,
    });
    return NextResponse.json({
      success: true,
      data: { stdout: stdout.slice(-2000), stderr: stderr.slice(-1000) },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || '备份执行失败' },
      { status: 500 }
    );
  }
}

async function listBackups(): Promise<
  { filename: string; date: string | null; size: number; mtime: string }[]
> {
  try {
    const entries = await fs.readdir(BACKUP_DIR);
    const list = await Promise.all(
      entries
        .filter((f) => /^warehouse_\d{4}-\d{2}-\d{2}\.sql\.gz$/.test(f))
        .map(async (f) => {
          const stat = await fs.stat(path.join(BACKUP_DIR, f));
          const m = f.match(/warehouse_(\d{4}-\d{2}-\d{2})\.sql\.gz/);
          return {
            filename: f,
            date: m ? m[1] : null,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          };
        })
    );
    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch {
    return [];
  }
}

async function readIntegrity(): Promise<Record<string, any> | null> {
  try {
    const raw = await fs.readFile(INTEGRITY_REPORT, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
