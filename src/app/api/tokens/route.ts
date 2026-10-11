import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { getSessionUser } from '@/lib/auth';
import crypto from 'crypto';

// 生成 Token
function generateToken(): string {
  return 'qc_' + crypto.randomBytes(32).toString('hex');
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    // 查询当前用户的 Token 列表
    const tokens = await prisma.$queryRaw`
      SELECT id, name, token, permissions, last_used_at, expires_at, status, created_at
      FROM api_tokens
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ success: true, data: serializeBigInt(tokens) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { name, permissions, expiresAt } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: 'Token 名称必填' }, { status: 400 });
    }

    const token = generateToken();

    await prisma.$executeRaw`
      INSERT INTO api_tokens (name, token, user_id, permissions, expires_at, status)
      VALUES (${name}, ${token}, ${user.id}, ${JSON.stringify(permissions || ['read'])}, ${expiresAt || null}, 1)
    `;

    return NextResponse.json({ success: true, data: { token, name } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, name } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 Token ID' }, { status: 400 });
    }

    // 验证 Token 属于当前用户
    const token = await prisma.$queryRaw`
      SELECT id FROM api_tokens WHERE id = ${id} AND user_id = ${user.id}
    ` as any[];

    if (!token.length) {
      return NextResponse.json({ success: false, error: 'Token 不存在' }, { status: 404 });
    }

    if (status !== undefined) {
      await prisma.$executeRaw`UPDATE api_tokens SET status = ${status} WHERE id = ${id}`;
    }
    if (name) {
      await prisma.$executeRaw`UPDATE api_tokens SET name = ${name} WHERE id = ${id}`;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少 Token ID' }, { status: 400 });
    }

    // 验证 Token 属于当前用户
    const token = await prisma.$queryRaw`
      SELECT id FROM api_tokens WHERE id = ${id} AND user_id = ${user.id}
    ` as any[];

    if (!token.length) {
      return NextResponse.json({ success: false, error: 'Token 不存在' }, { status: 404 });
    }

    await prisma.$executeRaw`DELETE FROM api_tokens WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
