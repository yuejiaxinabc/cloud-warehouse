import { NextRequest, NextResponse } from 'next/server';
import { runScheduledBackup } from '@/lib/backup';

/**
 * 内部定时入口（v1.2.4）
 *
 * 调用方：instrumentation 里的 60 秒定时器（同机 127.0.0.1）。
 * 鉴权：x-cron-secret 必须等于 NEXTAUTH_SECRET；不匹配直接 401。
 * 即使被外部误触，也只是让「检查是否到点」多跑一次，不会重复备份 ——
 * 真正的并发闸门在 runScheduledBackup 里的 SystemConfig 条件更新。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || '';
  if (!secret || secret !== (process.env.NEXTAUTH_SECRET || '')) {
    return NextResponse.json({ success: false, error: '未授权' }, { status: 401 });
  }
  try {
    const result = await runScheduledBackup();
    return NextResponse.json({ success: true, ran: result.ran, reason: result.reason || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: String(error?.message || error).slice(0, 300) }, { status: 500 });
  }
}
