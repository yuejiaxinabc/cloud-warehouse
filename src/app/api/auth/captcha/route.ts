import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// 内存存储：opaque token → { text, expiresAt }
// 生产环境建议换 Redis
const captchaStore = new Map<string, { text: string; expiresAt: number }>();

const EXPIRE_MS = 5 * 60 * 1000; // 5分钟

/** 生成不透明 token（随机字符串，与答案无关） */
function genToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function genText(len = 4) {
  // 去掉了易混淆的 0/O/1/l/I
  const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let t = "";
  for (let i = 0; i < len; i++) t += CHARS[Math.floor(Math.random() * CHARS.length)];
  return t;
}

/** GET /api/auth/captcha - 获取新验证码 token 和图片文字 */
export async function GET(req: NextRequest) {
  const text = genText(4);
  const token = genToken();

  // 清理过期 entry（懒清理）
  const now = Date.now();
  for (const [k, v] of captchaStore) {
    if (v.expiresAt < now) captchaStore.delete(k);
  }
  captchaStore.set(token, { text, expiresAt: now + EXPIRE_MS });

  return NextResponse.json(
    { token, text }, // 前端也可拿到 text 用于本地开发调试（生产去掉 text 字段）
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

/** POST /api/auth/captcha - 验证（登录前预验，防止机器人批量注册） */
export async function POST(req: NextRequest) {
  try {
    const { token, answer } = await req.json();
    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
    }
    const stored = captchaStore.get(token);
    if (!stored) return NextResponse.json({ success: false, error: "验证码已过期，请刷新" });
    if (Date.now() > stored.expiresAt) {
      captchaStore.delete(token);
      return NextResponse.json({ success: false, error: "验证码已过期，请刷新" });
    }
    if (stored.text.toLowerCase() !== String(answer || "").trim().toLowerCase()) {
      captchaStore.delete(token);
      return NextResponse.json({ success: false, error: "验证码错误" });
    }
    captchaStore.delete(token); // 一次性
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: "参数错误" }, { status: 400 });
  }
}
