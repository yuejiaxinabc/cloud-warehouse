import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getApiToken, generateApiToken, clearTokenCache } from '@/lib/api-token';

// GET /api/settings/token — 获取当前 Token 状态（?reveal=true 返回明文）
export async function GET(request: NextRequest) {
  try {
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/settings/token — 生成新 Token
export async function POST() {
  try {
    const newToken = generateApiToken();
    
    await prisma.systemConfig.upsert({
      where: { category_colKey: { category: 'security', colKey: 'api_token' } },
      create: { category: 'security', colKey: 'api_token', value: newToken },
      update: { value: newToken },
    });

    clearTokenCache();

    return NextResponse.json({
      success: true,
      data: { token: newToken },
      message: 'API Token 已生成，请妥善保存（仅显示一次）',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PUT /api/settings/token — 验证 Token（客户端调用）
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token不能为空' });
    }

    const validToken = await getApiToken();
    
    if (!validToken) {
      return NextResponse.json({ success: false, error: '系统未配置API Token，请联系管理员' });
    }

    if (token !== validToken) {
      return NextResponse.json({ success: false, error: 'Token验证失败，请检查是否正确' });
    }

    return NextResponse.json({
      success: true,
      message: 'Token验证成功',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/settings/token — 禁用 Token
export async function DELETE() {
  try {
    await prisma.systemConfig.deleteMany({
      where: { category: 'security', colKey: 'api_token' },
    });

    clearTokenCache();

    return NextResponse.json({
      success: true,
      message: 'API Token 已禁用',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
