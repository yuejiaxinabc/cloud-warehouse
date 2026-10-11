import { handleApiError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp } from '@/lib/log';
import bcrypt from 'bcryptjs';
import { sanitizeKeyword, sanitizeText } from '@/lib/sanitize';
import { requireAdmin } from '@/lib/auth-guard';

/**
 * GET /api/users - 用户列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const keyword = sanitizeKeyword(searchParams.get('keyword'), 80);
    const status = searchParams.get('status');

    const where: any = {};
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }
    if (status !== null && status !== undefined) where.status = Number(status);

    const [list, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true } },
          userRoles: {
            include: { role: { select: { id: true, name: true, code: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      data: {
        list: list.map((u) => ({
          id: Number(u.id),
          username: u.username,
          realName: u.realName,
          phone: u.phone ? u.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : null,
          email: u.email ? u.email.replace(/(.{2}).*(@.*)/, "$1***$2") : null,
          orgId: u.orgId ? Number(u.orgId) : null,
          orgName: u.organization?.name,
          status: u.status,
          roles: u.userRoles.map((ur) => ({
            id: Number(ur.role.id),
            name: ur.role.name,
            code: ur.role.code,
          })),
          lastLoginAt: u.lastLoginAt,
          createdAt: u.createdAt,
        })),
        total,
        page,
        pageSize,
      },
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

/**
 * POST /api/users - 创建用户
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();


    // 检查权限 - 超级管理员或有system权限的用户可以创建
    const userRoles = (session.user as any).roles || [];
    const permissions = (session.user as any).permissions || [];
    const isSuperAdmin = userRoles.includes('admin') || userRoles.includes('superadmin') || permissions.includes('*');

    if (!isSuperAdmin && !permissions.includes('system')) {
      return NextResponse.json(serializeBigInt({ success: false, error: '权限不足' }), { status: 403 });
    }

    const body = await request.json();
    // 安全净化：所有字符串输入均经过 sanitizeText，去除 HTML/SQL/XSS 危险字符
    const usernameRaw = sanitizeText(body.username, 32);
    const password = String(body.password || '');
    const realName = sanitizeText(body.realName, 100);
    const phone = sanitizeText(body.phone, 20);
    const email = sanitizeText(body.email, 200);
    const { roleIds, status: userStatus } = body;

    if (!usernameRaw || !password || !realName) {
      return NextResponse.json(serializeBigInt({ success: false, error: '用户名、密码、姓名必填' }), { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(serializeBigInt({ success: false, error: '密码至少8个字符' }), { status: 400 });
    }

    // 检查用户名唯一性
    const existing = await prisma.user.findUnique({ where: { username: usernameRaw } });
    if (existing) {
      return NextResponse.json(serializeBigInt({ success: false, error: '用户名已存在' }), { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: usernameRaw,
        password: hashedPassword,
        realName,
        phone: phone || null,
        email: email || null,
        status: userStatus !== undefined ? Number(userStatus) : 1,
        userRoles: roleIds && roleIds.length > 0
          ? { create: roleIds.map((roleId: any) => ({ roleId: BigInt(roleId) })) }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    await writeLog({ module: 'user', action: 'create', ip: getClientIp(), content: '新建用户 ' + user.username, refType: 'user', refId: user.id });
    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      data: {
        id: Number(user.id),
        username: user.username,
        realName: user.realName,
        roles: user.userRoles.map((ur) => ur.role.name),
      },
      message: `用户 ${user.username} 创建成功`,
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/users - 更新用户
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin();


    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(serializeBigInt({ success: false, error: '缺少用户ID' }), { status: 400 });
    }

    const body = await request.json();
    // 安全净化
    const newUsername = body.username ? sanitizeText(body.username, 32) : undefined;
    const newPassword = body.password ? String(body.password) : undefined;
    const realName = body.realName !== undefined ? sanitizeText(body.realName, 100) : undefined;
    const phone = body.phone !== undefined ? sanitizeText(body.phone, 20) : undefined;
    const email = body.email !== undefined ? sanitizeText(body.email, 200) : undefined;
    const { roleIds, status: userStatus } = body;

    // 构建更新数据
    const updateData: any = {};
    if (newUsername) updateData.username = newUsername;
    if (realName !== undefined) updateData.realName = realName || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;
    if (userStatus !== undefined) updateData.status = Number(userStatus);
    if (newPassword) {
      if (newPassword.length < 8) return NextResponse.json(serializeBigInt({ success: false, error: '密码至少8个字符' }), { status: 400 });
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const user = await prisma.user.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    if (roleIds !== undefined) {
      await prisma.userRole.deleteMany({ where: { userId: BigInt(id) } });
      if (roleIds && roleIds.length > 0) {
        await prisma.userRole.createMany({
          data: roleIds.map((roleId: any) => ({
            userId: BigInt(id),
            roleId: BigInt(roleId),
          })),
        });
      }
    }

    await writeLog({ module: 'user', action: 'update', ip: getClientIp(), content: '更新用户 ID:' + id, refType: 'user', refId: Number(id) });
    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: '用户更新成功',
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/users - 删除用户
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdmin();


    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(serializeBigInt({ success: false, error: '缺少用户ID' }), { status: 400 });
    }

    if (Number(id) === Number((session.user as any).id)) {
      return NextResponse.json(serializeBigInt({ success: false, error: '不能删除当前登录用户' }), { status: 400 });
    }

    await prisma.userRole.deleteMany({ where: { userId: BigInt(id) } });
    await prisma.user.delete({ where: { id: BigInt(id) } });

    await writeLog({ module: 'user', action: 'delete', ip: getClientIp(), content: '删除用户 ID:' + id, refType: 'user', refId: Number(id) });
    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: '用户删除成功',
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}
