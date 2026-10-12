import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError, NotFoundError } from '@/lib/errors';
import { z } from 'zod';

const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  remark: z.string().max(500).optional(),
  status: z.number().int().optional(),
  permissionIds: z.array(z.number().int().positive()).optional(),
});

/**
 * GET /api/roles/[id] - 角色详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { id } = idSchema.parse({ id: (await params).id });
    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) throw new NotFoundError('角色', id);

    return successResponse({
      ...role,
      id: Number(role.id),
      permissions: role.rolePermissions.map((rp) => ({
        id: Number(rp.permission.id),
        name: rp.permission.name,
        code: rp.permission.code,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/roles/[id] - 更新角色
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('system') && !permissions.includes('*')) {
      return errorResponse('权限不足', 403);
    }

    const { id } = idSchema.parse({ id: (await params).id });
    const body = await request.json();
    const validated = updateRoleSchema.parse(body);

    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError('角色', id);

    // 更新权限
    if (validated.permissionIds) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await prisma.rolePermission.createMany({
        data: validated.permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
      });
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: validated.name,
        remark: validated.remark,
        status: validated.status,
      },
      include: {
        rolePermissions: { include: { permission: true } },
      },
    });

    return successResponse({
      id: Number(updated.id),
      name: updated.name,
      code: updated.code,
      permissions: updated.rolePermissions.map((rp) => rp.permission.name),
    }, '角色更新成功');
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/roles/[id] - 删除角色
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const permissions = (session.user as any).permissions || [];
    if (!permissions.includes('system') && !permissions.includes('*')) {
      return errorResponse('权限不足', 403);
    }

    const { id } = idSchema.parse({ id: (await params).id });

    // 检查是否有关联用户
    const userCount = await prisma.userRole.count({ where: { roleId: id } });
    if (userCount > 0) {
      return errorResponse(`该角色下有 ${userCount} 个用户，无法删除`);
    }

    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.role.delete({ where: { id } });

    return successResponse(null, '角色已删除');
  } catch (error) {
    return handleApiError(error);
  }
}
