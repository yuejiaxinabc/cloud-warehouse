import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAdmin } from '@/lib/auth-guard';

/**
 * GET /api/roles - 角色列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const [list, total] = await Promise.all([
      prisma.role.findMany({
        include: {
          rolePermissions: {
            include: { permission: { select: { id: true, name: true, code: true } } },
          },
          _count: { select: { userRoles: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.role.count(),
    ]);

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      data: {
        list: list.map((r) => ({
          id: Number(r.id),
          name: r.name,
          code: r.code,
          description: r.remark,
          status: r.status,
          userCount: r._count.userRoles,
          permissions: r.rolePermissions.map((rp) => ({
            id: Number(rp.permission.id),
            name: rp.permission.name,
            code: rp.permission.code,
          })),
          createdAt: r.createdAt,
        })),
        total,
        page,
        pageSize,
      },
    }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

/**
 * POST /api/roles - 创建角色
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
    const { code, name, description, permissionIds } = body;

    if (!code || !name) {
      return NextResponse.json(serializeBigInt({ success: false, error: '角色编码和名称必填' }), { status: 400 });
    }

    // 检查编码唯一性
    const existing = await prisma.role.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(serializeBigInt({ success: false, error: '角色编码已存在' }), { status: 400 });
    }

    const role = await prisma.role.create({
      data: {
        name,
        code,
        remark: description || null,
        status: 1,
        rolePermissions: permissionIds && permissionIds.length > 0
          ? { create: permissionIds.map((permissionId: any) => ({ permissionId: BigInt(permissionId) })) }
          : undefined,
      },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      data: { id: Number(role.id), name: role.name, code: role.code },
      message: '角色创建成功',
    }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

/**
 * PUT /api/roles - 更新角色
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin();


    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(serializeBigInt({ success: false, error: '缺少角色ID' }), { status: 400 });
    }

    const body = await request.json();
    const { code, name, description, permissionIds } = body;

    // 构建更新数据
    const updateData: any = {};
    if (code) updateData.code = code;
    if (name) updateData.name = name;
    if (description !== undefined) updateData.remark = description || null;

    // 更新角色基本信息
    const role = await prisma.role.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    // 更新权限关联
    if (permissionIds !== undefined) {
      // 删除旧的权限关联
      await prisma.rolePermission.deleteMany({
        where: { roleId: BigInt(id) },
      });
      // 创建新的权限关联
      if (permissionIds && permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId: any) => ({
            roleId: BigInt(id),
            permissionId: BigInt(permissionId),
          })),
        });
      }
    }

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: '角色更新成功',
    }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

/**
 * DELETE /api/roles - 删除角色
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAdmin();


    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json(serializeBigInt({ success: false, error: '缺少角色ID' }), { status: 400 });
    }

    // 检查是否有用户使用此角色
    const userCount = await prisma.userRole.count({
      where: { roleId: BigInt(id) },
    });

    if (userCount > 0) {
      return NextResponse.json(serializeBigInt({ 
        success: false, 
        error: `该角色下还有 ${userCount} 个用户，无法删除` 
      }), { status: 400 });
    }

    // 删除角色权限关联
    await prisma.rolePermission.deleteMany({
      where: { roleId: BigInt(id) },
    });

    // 删除角色
    await prisma.role.delete({
      where: { id: BigInt(id) },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: '角色删除成功',
    }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}
