import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { getSessionUser } from '@/lib/auth';
import { isTableMissingError } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import crypto from 'crypto';

/**
 * 个人 API Token 管理
 * v1.2.1（P1-4/P2-11）：api_tokens 表在 schema 里没有对应模型、也没有迁移会创建它，
 * 打过去必抛「Table 'warehouse.api_tokens' does not exist」并原样回显给前端。
 * 这里统一收敛成 503「开放接口未就绪」，让前端能给出可读提示。
 */
const TABLE_MISSING = '开放接口未就绪：缺少 api_tokens 表，请先执行 prisma db push 或联系管理员';

// 生成 Token
function generateToken(): string {
  return 'qc_' + crypto.randomBytes(32).toString('hex');
}

function tableMissingResponse() {
  return NextResponse.json({ success: false, code: 503, error: TABLE_MISSING }, { status: 503 });
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
    if (isTableMissingError(error)) return tableMissingResponse();
    return handleApiError(error);
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

    if (!user.permissions.length) return NextResponse.json({ success: false, error: '权限不足：未分配业务权限' }, { status: 403 });
    const token = generateToken();

    await prisma.$executeRaw`
      INSERT INTO api_tokens (name, token, user_id, permissions, expires_at, status)
      VALUES (${name}, ${token}, ${user.id}, ${JSON.stringify({ sessionVersion: user.sessionVersion, permissions: Array.isArray(permissions) ? permissions : ['read'] })}, ${expiresAt || null}, 1)
    `;

    return NextResponse.json({ success: true, data: { token, name } });
  } catch (error: any) {
    if (isTableMissingError(error)) return tableMissingResponse();
    return handleApiError(error);
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
    if (isTableMissingError(error)) return tableMissingResponse();
    return handleApiError(error);
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
    if (isTableMissingError(error)) return tableMissingResponse();
    return handleApiError(error);
  }
}
