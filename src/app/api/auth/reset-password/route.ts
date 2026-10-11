import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

/** GET /api/auth/reset-password?token=xxx - 仅校验 token 是否有效 / 是否过期（不修改密码） */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        serializeBigInt({ success: false, valid: false, expired: false, reason: "missing" })
      );
    }

    const user = await prisma.user.findFirst({
      where: { verifyToken: token },
      select: { id: true, username: true, status: true, verifyTokenExpires: true },
    });

    if (!user || user.status !== 1) {
      return NextResponse.json(
        serializeBigInt({ success: false, valid: false, expired: false, reason: "notfound" })
      );
    }

    if (user.verifyTokenExpires && new Date(user.verifyTokenExpires) < new Date()) {
      return NextResponse.json(
        serializeBigInt({ success: false, valid: false, expired: true, reason: "expired" })
      );
    }

    return NextResponse.json(
      serializeBigInt({ success: true, valid: true, username: user.username })
    );
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, valid: false, expired: false, error: error.message }),
      { status: 500 }
    );
  }
}

/** POST /api/auth/reset-password - 使用 token 重设密码 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!token || !newPassword) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "参数不完整" }),
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "密码长度至少 8 位" }),
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({ where: { verifyToken: token } });
    if (!user || user.status !== 1) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "重置链接无效，请重新申请" }),
        { status: 400 }
      );
    }

    // 过期校验
    if (user.verifyTokenExpires && new Date(user.verifyTokenExpires) < new Date()) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "重置链接已过期，请重新申请" }),
        { status: 400 }
      );
    }

    // 新密码不能和用户名相同
    if (newPassword === user.username) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "新密码不能和用户名相同" }),
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        verifyToken: null,
        verifyTokenExpires: null,
      },
    });

    return NextResponse.json(
      serializeBigInt({ success: true, message: "密码重置成功" })
    );
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
