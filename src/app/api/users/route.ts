import { handleApiError, AppError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { writeLog, getClientIp } from '@/lib/log';
import bcrypt from 'bcryptjs';
import { sanitizeKeyword, sanitizeText } from '@/lib/sanitize';
import { requireAdmin, requirePermission } from '@/lib/auth-guard';

// P2-4：用户名/姓名白名单。v1.2.0 只用 sanitizeText 去标签，
// 结果 username=alert(1) 也能建成账号（id 9），这里按白名单逐字符收紧。
// 用户名：3-20 位字母/数字/下划线；姓名：中英文、数字、空格与少量连接符，禁止 < > 引号 & 等注入字符。
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const REAL_NAME_RE = /^[\u4e00-\u9fa5a-zA-Z0-9·.\-_()（） ]{1,50}$/;

function positiveId(value: unknown, field: string): bigint {
  if (!/^[1-9][0-9]*$/.test(String(value ?? ''))) throw new AppError(field + '必须为正整数', 400);
  return BigInt(String(value));
}
async function validateAssignments(body: any) {
  if (body.status !== undefined && ![0, 1].includes(body.status)) throw new AppError('status必须为0或1', 400);
  if (body.roleIds !== undefined) {
    if (!Array.isArray(body.roleIds)) throw new AppError('roleIds必须是数组', 400);
    const ids = [...new Set<string>(body.roleIds.map((v: unknown) => positiveId(v, 'roleId').toString()))].map(v => BigInt(v));
    if (await prisma.role.count({ where: { id: { in: ids }, status: 1 } }) !== ids.length) throw new AppError('角色不存在或已停用', 400);
    body.roleIds = ids;
  }
  if (body.orgId !== undefined && body.orgId !== null && body.orgId !== '') {
    const id = positiveId(body.orgId, 'orgId');
    if (!await prisma.organization.findFirst({ where: { id, status: 1 } })) throw new AppError('组织不存在或已停用', 400);
    body.orgId = id;
  }
  if (body.email !== undefined && String(body.email ?? '').length > 100) throw new AppError('邮箱长度最多100字符', 400);
}

/**
 * GET /api/users - 用户列表
 */
export async function GET(request: NextRequest) {
  try {
    // P0-1/P1-8：用户列表含手机号/邮箱，属管理面数据，只读角色不得读取
    await requirePermission('user:manage');
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
    const session = await requirePermission('user:manage');


    const body = await request.json();
    await validateAssignments(body);
    // P2-4：白名单校验必须在 sanitize 之前做，
    // 否则 "<script>alert(1)</script>" 被去标签后变成 "scriptalert(1)/script" 反而通过
    const usernameRaw = String(body.username ?? '').trim();
    if (!USERNAME_RE.test(usernameRaw)) {
      return NextResponse.json(serializeBigInt({ success: false, error: '用户名需为 3-20 位字母、数字或下划线' }), { status: 400 });
    }
    const realNameRaw = String(body.realName ?? '').trim();
    if (!REAL_NAME_RE.test(realNameRaw)) {
      return NextResponse.json(serializeBigInt({ success: false, error: '姓名只能包含中英文、数字、空格及 · . - _ ( )（），长度 1-50' }), { status: 400 });
    }
    const password = String(body.password || '');
    // 安全净化：正则已挡掉危险字符，sanitizeText 作为纵深防御保留
    const realName = sanitizeText(realNameRaw, 100);
    const phone = sanitizeText(body.phone, 20);
    const email = sanitizeText(body.email, 100);
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
        // v1.2.3 数据权限：用户归属组织，DEPT / DEPT_AND_CHILD 档位据此生效
        orgId: body.orgId ? BigInt(body.orgId) : null,
        userRoles: roleIds && roleIds.length > 0
          ? { create: roleIds.map((roleId: any) => ({ roleId: BigInt(roleId) })) }
          : undefined,
      },
      include: {
        userRoles: { include: { role: true } },
      },
    });

    const { clearDataScopeCache } = await import('@/lib/data-scope');
    clearDataScopeCache();

    await writeLog({ module: 'user', action: 'create', userId: (session.user as any).id, ip: getClientIp(), content: '新建用户 ' + user.username, refType: 'user', refId: user.id });
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
    const session = await requirePermission('user:manage');


    const { searchParams } = new URL(request.url);
    const body = await request.json();
    const queryId = searchParams.get('id');
    if (queryId && body.id !== undefined && String(body.id) !== queryId) throw new AppError('query id与body id不一致', 400);
    const id = positiveId(queryId ?? body.id, 'id').toString();
    await validateAssignments(body);
    // P2-4：改名同样走白名单（写库前校验，不依赖前端）
    let newUsername: string | undefined;
    if (body.username !== undefined && String(body.username).trim() !== '') {
      const raw = String(body.username).trim();
      if (!USERNAME_RE.test(raw)) {
        return NextResponse.json(serializeBigInt({ success: false, error: '用户名需为 3-20 位字母、数字或下划线' }), { status: 400 });
      }
      newUsername = raw;
    }
    let realName: string | undefined;
    if (body.realName !== undefined) {
      const raw = String(body.realName ?? '').trim();
      if (!REAL_NAME_RE.test(raw)) {
        return NextResponse.json(serializeBigInt({ success: false, error: '姓名只能包含中英文、数字、空格及 · . - _ ( )（），长度 1-50' }), { status: 400 });
      }
      realName = sanitizeText(raw, 100);
    }
    const newPassword = body.password ? String(body.password) : undefined;
    const phone = body.phone !== undefined ? sanitizeText(body.phone, 20) : undefined;
    const email = body.email !== undefined ? sanitizeText(body.email, 100) : undefined;
    const { roleIds, status: userStatus } = body;

    // 构建更新数据
    const updateData: any = {};
    if (newUsername) updateData.username = newUsername;
    if (realName !== undefined) updateData.realName = realName || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;
    if (userStatus !== undefined) updateData.status = Number(userStatus);
    // v1.2.3 数据权限：组织归属可单独调整
    if (body.orgId !== undefined) updateData.orgId = body.orgId ? BigInt(body.orgId) : null;
    if (newPassword) {
      if (newPassword.length < 8) return NextResponse.json(serializeBigInt({ success: false, error: '密码至少8个字符' }), { status: 400 });
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    if (newPassword || userStatus === 0) updateData.sessionVersion = { increment: 1 };
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: BigInt(id) }, data: updateData });
      if (roleIds !== undefined) {
        await tx.userRole.deleteMany({ where: { userId: BigInt(id) } });
        if (roleIds.length) await tx.userRole.createMany({ data: roleIds.map((roleId: bigint) => ({ userId: BigInt(id), roleId })) });
      }
    });
    const { clearDataScopeCache } = await import('@/lib/data-scope');
    clearDataScopeCache();

    await writeLog({ module: 'user', action: 'update', userId: (session.user as any).id, ip: getClientIp(), content: '更新用户 ID:' + id + '（角色/组织变更实时生效，停用或改密撤销旧会话）', refType: 'user', refId: Number(id) });
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
    const session = await requirePermission('user:manage');


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

    await writeLog({ module: 'user', action: 'delete', userId: (session.user as any).id, ip: getClientIp(), content: '删除用户 ID:' + id, refType: 'user', refId: Number(id) });
    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: '用户删除成功',
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}
