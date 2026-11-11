import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getChannel, setChannel, type Channel } from '@/lib/version';
import { handleApiError, errorResponse, successResponse } from '@/lib/errors';

/**
 * 更新通道（v1.2.7）
 *
 * GET  /api/system/channel  读本机订阅的通道
 * POST /api/system/channel  切换通道（仅 admin）
 *
 * 通道是「每台设备」的偏好：生产机保持 stable，验证机切 beta，
 * 这样同一个更新中心可以同时推正式版与小范围测试版。
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    return NextResponse.json({ success: true, data: { channel: await getChannel() } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!Array.isArray((auth.user as any)?.roles) || !(auth.user as any).roles.includes('admin')) {
      return errorResponse('权限不足，仅管理员可切换更新通道', 403);
    }
    const body = await req.json().catch(() => ({} as any));
    const channel = body?.channel === 'beta' ? 'beta' : body?.channel === 'stable' ? 'stable' : null;
    if (!channel) return errorResponse('通道只能是 stable 或 beta', 400);
    await setChannel(channel as Channel);
    return successResponse({ channel }, '更新通道已切换为' + (channel === 'beta' ? '测试版' : '主版本'));
  } catch (error) {
    return handleApiError(error);
  }
}
