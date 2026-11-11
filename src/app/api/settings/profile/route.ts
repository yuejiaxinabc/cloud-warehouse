import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { sanitizeText, isValidEmail, isValidPhone } from "@/lib/sanitize";
import { handleApiError } from "@/lib/errors";
import { getSessionChecked } from '@/lib/auth-guard';

const VERIFY_TOKEN_EXPIRY = 30 * 60 * 1000; // 30分钟

/** GET /api/settings/profile - 获取当前用户资料 */
export async function GET() {
  try {
    const session = await getSessionChecked();
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
    return handleApiError(error);
  }
}

/**
 * PUT /api/settings/profile - 更新个人资料（不含密码）
 *
 * v1.2.0 只有一行注释、没有实现 → 前端保存拿到 405「服务器无响应」（P1-6）。
 * 这里只允许改 姓名/手机/邮箱：username、password、roleIds、status 一律忽略，
 * 避免这条自助接口被拿来改口令或提权。
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionChecked();
    if (!session) return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });

    const userId = (session.user as any).id;
    if (!userId) return NextResponse.json({ success: false, error: "会话异常，请重新登录" }, { status: 401 });

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
    }

    // 白名单取字段 + sanitize：去掉 HTML/引号等危险字符，长度按数据库列宽收紧
    const realName = sanitizeText(body.realName, 50);
    const phone = sanitizeText(body.phone, 20);
    const email = sanitizeText(body.email, 100);

    if (!realName) {
      return NextResponse.json({ success: false, error: "姓名必填" }, { status: 400 });
    }
    if (phone && !isValidPhone(phone)) {
      return NextResponse.json({ success: false, error: "手机号格式不正确" }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ success: false, error: "邮箱格式不正确" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: BigInt(userId) },
      data: {
        realName,
        phone: phone || null,
        email: email || null,
      },
      select: { id: true, username: true, realName: true, phone: true, email: true },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        id: Number(updated.id),
        username: updated.username,
        realName: updated.realName,
        phone: updated.phone,
        email: updated.email,
      },
      message: "资料已更新",
    }));
  } catch (error: any) {
    return handleApiError(error);
  }
}