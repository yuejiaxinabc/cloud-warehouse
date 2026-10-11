import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { sanitizeText } from "@/lib/sanitize";

const VERIFY_TOKEN_EXPIRY = 30 * 60 * 1000; // 30分钟

/** GET /api/settings/profile - 获取当前用户资料 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });

    const userId = (session.user as any).id;
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      include: {
        userRoles: { include: { role: { select: { id: true, name: true, code: true } } } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!user) return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        id: Number(user.id),
        username: user.username,
        realName: user.realName,
        phone: user.phone,
        email: user.email,
        orgId: user.orgId ? Number(user.orgId) : null,
        orgName: user.organization?.name,
        status: user.status,
        roles: user.userRoles.map((ur) => ({ id: Number(ur.role.id), name: ur.role.name, code: ur.role.code })),
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
    }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

/** PUT /api/settings/profile - 更新个人资料（不含密码） */