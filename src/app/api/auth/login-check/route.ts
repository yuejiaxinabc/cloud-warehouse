import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/login-check —— 已废弃的诊断接口（FIX-2026-1003）
 *
 * 历史问题：本接口曾执行完整密码校验并区分「用户名不存在/密码错误」，
 * 形成绕过 NextAuth 的旁路认证口 + 用户名枚举通道。
 * 现已固定返回统一文案，不做任何数据库查询，仅供旧客户端兼容（永远失败，引导走正常登录）。
 */
export async function POST(req: NextRequest) {
  return NextResponse.json(
    { success: false, error: "账号或密码错误，请通过登录页重新登录" },
    { status: 200 }
  );
}
