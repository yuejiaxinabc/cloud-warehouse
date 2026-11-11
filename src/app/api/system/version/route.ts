import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { checkUpdate, type Channel } from '@/lib/version';
import { handleApiError } from '@/lib/errors';

/**
 * GET /api/system/version —— 登录即可读（侧边栏与设置页共用）
 *  ?refresh=1      强制穿透 60 秒缓存（「检查更新」按钮用）
 *  ?channel=beta   按指定通道查（切换通道后立刻看结果用，不落库）
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const force = sp.get('refresh') === '1';
    const raw = sp.get('channel');
    const channel = raw === 'beta' || raw === 'stable' ? (raw as Channel) : undefined;
    const info = await checkUpdate({ force, channel });
    return NextResponse.json({ success: true, data: info });
  } catch (error) {
    return handleApiError(error);
  }
}
