import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getApiToken, generateApiToken, clearTokenCache, validateSystemToken } from '@/lib/api-token';
import { requireAdmin, requireLogin } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

/**
 * 系统级 API Token 管理（客户端 APP 访问控制）
 *
 * P0-1/P1-8：v1.2.0 这些方法完全没有鉴权，任何登录账号（含 auditor）
 * 都能读取/轮换/作废系统 Token。读写一律收归管理员，仅验证接口保留登录可调用。
 */

// GET /api/settings/token — 获取当前 Token 状态（?reveal=true 返回明文）
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const token = await getApiToken();
    const reveal = request.nextUrl.searchParams.get('reveal') === 'true';
    return NextResponse.json({
      success: true,
      data: {
        configured: !!token,
        token: reveal ? token : undefined,
        tokenPreview: token ? `${token.substring(0, 6)}${'*'.repeat(20)}${token.substring(token.length - 4)}` : null,
      },
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}

// POST /api/settings/token — 生成新 Token
export async function POST() {
  try {
    const session = await requireAdmin();
    const owner = session.user as any;
    const newToken = generateApiToken();

    await prisma.$transaction([
      prisma.systemConfig.upsert({
        where: { category_colKey: { category: 'security', colKey: 'api_token' } },
        create: { category: 'security', colKey: 'api_token', value: newToken }, update: { value: newToken },
      }),
      prisma.systemConfig.upsert({
        where: { category_colKey: { category: 'security', colKey: 'api_token_owner' } },
        create: { category: 'security', colKey: 'api_token_owner', value: JSON.stringify({ userId: owner.id, sessionVersion: owner.sessionVersion }) },
        update: { value: JSON.stringify({ userId: owner.id, sessionVersion: owner.sessionVersion }) },
      }),
    ]);

    clearTokenCache();

    return NextResponse.json({
      success: true,
      data: { token: newToken },
      message: 'API Token 已生成，请妥善保存（仅显示一次）',
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}

// PUT /api/settings/token — 验证 Token（客户端调用，登录即可）
export async function PUT(req: NextRequest) {
  try {
    await requireLogin();
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token不能为空' });
    }

    const validToken = await getApiToken();

    if (!validToken) {
      return NextResponse.json({ success: false, error: '系统未配置API Token，请联系管理员' });
    }

    if (!await validateSystemToken(String(token))) {
      return NextResponse.json({ success: false, error: 'Token验证失败，请检查是否正确' });
    }

    return NextResponse.json({
      success: true,
      message: 'Token验证成功',
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}

// DELETE /api/settings/token — 禁用 Token
export async function DELETE() {
  try {
    await requireAdmin();
    await prisma.systemConfig.deleteMany({
      where: { category: 'security', colKey: 'api_token' },
    });

    clearTokenCache();

    return NextResponse.json({
      success: true,
      message: 'API Token 已禁用',
    });
  } catch (error: any) {
    return handleApiError(error);
  }
}
