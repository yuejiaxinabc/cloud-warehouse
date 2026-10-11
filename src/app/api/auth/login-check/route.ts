import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { writeLog, getClientIp, getClientPlatform, PLATFORM_NAMES } from "@/lib/log";

/**
 * POST /api/auth/login-check - 登录前校验 + 记录日志（含真实IP和平台）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!username || !password) {
      return NextResponse.json({ success: false, error: "请输入用户名和密码" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, status: true, password: true, realName: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "用户名不存在，请检查是否输入正确（注意大小写和空格）" });
    }

    if (user.status !== 1) {
      return NextResponse.json({ success: false, error: "该账号已被停用，请联系管理员启用" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ success: false, error: "密码错误，请重新输入" });
    }

    // 登录校验通过，记录日志（含真实IP和客户端平台）
    const ip = getClientIp();
    const platform = getClientPlatform();
    const platformName = PLATFORM_NAMES[platform] || platform;

    await writeLog({
      module: 'auth',
      action: 'login',
      content: `用户 ${user.realName || username} 登录成功 [来源: ${platformName}]`,
      userId: user.id,
      ip: ip,
    });

    return NextResponse.json({ success: true, message: "账号信息校验通过" });
  } catch (error: any) {
    console.error("Login check API error:", error);
    return NextResponse.json({ success: false, error: "校验服务异常，请稍后重试" });
  }
}
