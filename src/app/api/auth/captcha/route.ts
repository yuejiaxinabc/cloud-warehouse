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

/** 生成防机器人 SVG 验证码图（答案不下发客户端，FIX-2026-1002） */
function genSvg(text: string): string {
  const w = 120, h = 44;
  const chars = text.split("");
  const colors = ["#1677FF", "#4096FF", "#1677FF", "#4096FF"];
  const charSvg = chars
    .map((ch, i) => {
      const x = 22 + i * 22 + (Math.random() * 4 - 2);
      const y = 30 + (Math.random() * 4 - 2);
      const rot = (Math.random() - 0.5) * 14;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${colors[i % colors.length]}" font-family="Courier New,monospace" font-size="24" font-weight="bold" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${ch}</text>`;
    })
    .join("");
  const noise = Array.from({ length: 4 }, () => {
    const x1 = Math.random() * w, y1 = Math.random() * h, x2 = Math.random() * w, y2 = Math.random() * h;
    const xm = Math.random() * w, ym = Math.random() * h;
    return `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)} Q${xm.toFixed(0)} ${ym.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="rgba(150,180,230,0.35)" fill="none" stroke-width="1"/>`;
  }).join("");
  const dots = Array.from({ length: 14 }, () => {
    const cx = (Math.random() * w).toFixed(0), cy = (Math.random() * h).toFixed(0);
    return `<circle cx="${cx}" cy="${cy}" r="1" fill="rgba(150,170,220,0.4)"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0F5FF"/><stop offset="1" stop-color="#E6F0FF"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${noise}${dots}${charSvg}</svg>`;
}

/** GET /api/auth/captcha - 获取新验证码 token 和 SVG 图（不返回答案文本） */
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
    { token, svg: genSvg(text) }, // 仅返回图片，绝不返回答案 text（FIX-2026-1002）
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
