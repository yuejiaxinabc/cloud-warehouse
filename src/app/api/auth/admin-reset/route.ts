import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { hash, compare } from "bcryptjs";
import crypto from "crypto";

// POST /api/auth/admin-reset
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // 管理员设置/更新全局重置令牌
    if (action === "set-token") {
      const session = await requireAdmin();
      const { token } = body;

      let resetToken = token?.trim();
      if (!resetToken) {
        resetToken = crypto.randomBytes(16).toString("hex");
      } else if (resetToken.length < 16) {
        return NextResponse.json({ success: false, error: "令牌不能少于16位" }, { status: 400 });
      }

      const hashedToken = await hash(resetToken, 10);

      await prisma.systemConfig.upsert({
        where: { category_colKey: { category: "reset_token", colKey: "global" } },
        update: { value: hashedToken },
        create: { category: "reset_token", colKey: "global", value: hashedToken },
      });

      return NextResponse.json({
        success: true,
        data: { token: resetToken },
        message: "全局重置令牌已设置",
      });
    }

    // 管理员清除全局重置令牌
    if (action === "clear-token") {
      const session = await requireAdmin();
      await prisma.systemConfig.deleteMany({
        where: { category: "reset_token" },
      });
      return NextResponse.json({ success: true, message: "重置令牌已清除" });
    }

    // 查询全局令牌状态
    if (action === "check-token") {
      const session = await requireAdmin();
      const config = await prisma.systemConfig.findFirst({
        where: { category: "reset_token", colKey: "global" },
      });
      return NextResponse.json({ success: true, data: { hasToken: !!config } });
    }

    // 用户用令牌重置密码
    if (action === "verify") {
      const { username, token, newPassword } = body;

      if (!username || !token || !newPassword) {
        return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ success: false, error: "新密码至少8位" }, { status: 400 });
      }

      // 查找用户（不存在与后续令牌错误返回同一文案，避免用户名枚举，FIX-2026-1003）
      const user = await prisma.user.findFirst({
        where: { username: username.trim(), status: 1 },
        select: { id: true },
      });

      // 查全局令牌
      const config = await prisma.systemConfig.findFirst({
        where: { category: "reset_token", colKey: "global" },
      });
      if (!config) {
        return NextResponse.json({ success: false, error: "系统未设置重置令牌，请联系管理员" }, { status: 400 });
      }

      // 验证令牌（用户不存在时仍执行一次 compare，保证响应时间一致，防时序枚举）
      const valid = await compare(token, config.value);
      if (!user || !valid) {
        return NextResponse.json({ success: false, error: "用户名或重置令牌错误" }, { status: 400 });
      }

      // 重置密码
      const hashedPassword = await hash(newPassword, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return NextResponse.json({ success: true, message: "密码重置成功，请使用新密码登录" });
    }

    return NextResponse.json({ success: false, error: "无效操作" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
