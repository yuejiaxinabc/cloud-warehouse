import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Token 验证中间件
export async function validateApiToken(req: NextRequest): Promise<{ valid: boolean; userId?: number; error?: string }> {
  // 从 Header 或 Query 获取 Token
  const authHeader = req.headers.get('authorization');
  const queryToken = new URL(req.url).searchParams.get('token');
  
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return { valid: false, error: '缺少 API Token' };
  }

  // 查询 Token
  const tokens = await prisma.$queryRaw`
    SELECT id, user_id, permissions, expires_at, status
    FROM api_tokens
    WHERE token = ${token}
    LIMIT 1
  ` as any[];

  if (!tokens.length) {
    return { valid: false, error: 'Token 无效' };
  }

  const tokenData = tokens[0];

  // 检查状态
  if (tokenData.status !== 1) {
    return { valid: false, error: 'Token 已禁用' };
  }

  // 检查过期
  if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
    return { valid: false, error: 'Token 已过期' };
  }

  // 更新最后使用时间
  await prisma.$executeRaw`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${tokenData.id}`;

  return { 
    valid: true, 
    userId: Number(tokenData.user_id),
  };
}

// 检查权限
export function hasPermission(permissions: string[], required: string): boolean {
  if (!permissions) return false;
  if (permissions.includes('admin')) return true;
  return permissions.includes(required);
}
