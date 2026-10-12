import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import { requireAdmin, authErrorResponse } from '@/lib/auth-guard';

const execFileAsync = promisify(execFile);

const RESTORE_SCRIPT =
  process.env.RESTORE_SCRIPT || '/opt/inventory-system/scripts/restore.sh';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD'),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return authErrorResponse(e);
  }
  try {
    const body = await req.json();
    const { date } = bodySchema.parse(body);
    // 以参数形式传入（非 shell 插值），配合脚本内文件名校验，杜绝命令注入
    const { stdout, stderr } = await execFileAsync(
      'bash',
      [RESTORE_SCRIPT, date],
      { timeout: 10 * 60 * 1000 }
    );
    return NextResponse.json({
      success: true,
      data: { stdout: stdout.slice(-3000), stderr: stderr.slice(-1500) },
    });
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json(
        { success: false, error: '请求参数不合法：' + JSON.stringify(e.issues) },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: e?.message || '回滚执行失败' },
      { status: 500 }
    );
  }
}
