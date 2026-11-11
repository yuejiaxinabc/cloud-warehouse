import { NextRequest, NextResponse } from "next/server";
import { issueCaptcha, consumeCaptcha } from "@/lib/captcha-store";
import { renderCaptchaPng } from "@/lib/captcha-render";

/**
 * 验证码（M6 修复）
 *
 * v1.2.0 返回 SVG，字符被画成像素方块 path —— 但每个字符的 path 数据是固定的，
 * 攻击者把 d 前缀与字符建表即可 100% 还原（报告里 8/8 全对）。
 *
 * 现在只返回 PNG 光栅图（服务端渲染、逐像素抖动、干扰线、噪点），
 * 响应里既没有文本也没有可查表的矢量结构。
 * 票据仍然一次性：登录时由 authorize() 消费，独立校验接口只校验不消费。
 */

export async function GET(_req: NextRequest) {
  try {
    const { token, text } = issueCaptcha(4);
    const png = renderCaptchaPng(text);
    const image = "data:image/png;base64," + png.toString("base64");

    return NextResponse.json(
      { token, image },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    console.error("[captcha] 渲染失败:", error);
    return NextResponse.json(
      { success: false, token: "", image: "", error: "验证码生成失败，请刷新重试" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

/**
 * POST /api/auth/captcha - 独立校验（保留给旧客户端）
 *
 * 注意：票据一次性。走这里校验过之后，同一 token 不能再用于登录；
 * Web 登录页已改为把 captchaToken / captchaAnswer 直接提交给 NextAuth，
 * 由 authorize() 统一消费。
 */
export async function POST(req: NextRequest) {
  try {
    const { token, answer } = await req.json();
    const r = consumeCaptcha(String(token || ""), String(answer || ""));
    if (!r.ok) return NextResponse.json({ success: false, error: r.error });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }
}
