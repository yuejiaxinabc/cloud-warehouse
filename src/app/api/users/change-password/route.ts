import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { serializeBigInt } from "@/lib/serialize";
import { handleApiError } from '@/lib/errors';
import { getSessionChecked } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * POST /api/users/change-password - 当前用户自助修改密码
 * body: { oldPassword, newPassword, confirmPassword }
 * 规则：新密码 ≥8字符，且不能与用户名相同（已由前端限制，但后端双重验证）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionChecked();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
    }

    const body = await request.json();
    const { oldPassword, newPassword, confirmPassword } = body;

    // 前端已做长度校验，后端再次验证
    if (!oldPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "请填写所有字段" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, error: "新密码至少8个字符" }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, error: "两次输入的新密码不一致" }, { status: 400 });
    }

    const userId = (session.user as any).id;
    if (!userId) {
      return NextResponse.json({ success: false, error: "会话异常，请重新登录" }, { status: 400 });
    }

    // 取出用户
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true, username: true, password: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: "用户不存在" }, { status: 404 });
    }

    // 验证旧密码
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "原密码错误" }, { status: 400 });
    }

    // 新密码不能与用户名相同（双重保险）
    if (newPassword.toLowerCase() === user.username.toLowerCase()) {
      return NextResponse.json({ success: false, error: "新密码不能与用户名相同" }, { status: 400 });
    }

    // 更新密码
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, sessionVersion: { increment: 1 }, updatedAt: new Date() },
    });

    await writeLog({ module: 'auth', action: 'password_change', userId: user.id, refType: 'user', refId: user.id, ip: getClientIp(), content: '自助修改密码，撤销全部旧会话' });
    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: "密码修改成功，请使用新密码重新登录",
    }));
  } catch (error: any) {
    console.error("Change password error:", error);
    return handleApiError(error);
  }
}
