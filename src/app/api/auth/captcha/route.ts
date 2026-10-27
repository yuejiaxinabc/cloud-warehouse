import { NextRequest, NextResponse } from "next/server";
import { issueCaptcha, consumeCaptcha } from "@/lib/captcha-store";
import { glyphPath } from "@/lib/captcha-font";

/**
 * 验证码（FIX-2026-1012）
 *
 * 原先用 <text> 节点画字符，答案明文躺在响应里，一条正则就能读出来
 * （实测解析出 88bJ 并成功登录）。现在每个字符用 5x7 点阵画成 <path>，
 * 响应里没有可提取的文本，破解需要做抗旋转/抗噪的图像识别。
 */

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function genSvg(text: string): string {
  const w = 132, h = 46;
  const colors = ["#1677FF", "#4096FF", "#1D4ED8", "#2563EB"];

  const chars = text.split("").map((ch, i) => {
    const d = glyphPath(ch);
    if (!d) return "";
    const x = 12 + i * 28 + rand(-3, 3);
    const y = 14 + rand(-4, 4);
    const scale = rand(2.5, 3.1);
    const rot = rand(-14, 14);
    const skew = rand(-6, 6);
    const fill = colors[i % colors.length];
    // 先斜切再旋转再缩放，落在 (x,y)
    const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) skewX(${skew.toFixed(1)}) scale(${scale.toFixed(2)})`;
    // 描边 + 填充一起用，边缘更糊，干扰识别
    return `<path d="${d}" fill="${fill}" stroke="${fill}" stroke-width="0.18" transform="${t}"/>`;
  }).join("");

  const noise = Array.from({ length: 5 }, () => {
    const x1 = rand(0, w), y1 = rand(0, h), x2 = rand(0, w), y2 = rand(0, h);
    const xm = rand(0, w), ym = rand(0, h);
    return `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)} Q${xm.toFixed(0)} ${ym.toFixed(0)} ${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="rgba(120,160,220,0.45)" fill="none" stroke-width="1.2"/>`;
  }).join("");

  const dots = Array.from({ length: 24 }, () => {
    const cx = rand(0, w).toFixed(0), cy = rand(0, h).toFixed(0);
    return `<circle cx="${cx}" cy="${cy}" r="1.1" fill="rgba(130,160,215,0.5)"/>`;
  }).join("");

  // FIX-2026-1012b：这里原本用 <defs><linearGradient> 做渐变背景，
  // 但 Next 的 SWC 压缩会把相邻的模板字面量折叠成单个字符串，
  // 折叠时把 "<defs>...</defs>" 整段丢掉，还漏掉 svg 开标签的 ">"，
  // 导致整个 SVG 被当作属性值吞掉、验证码渲染成空白。
  // （tsc 单独编译是正确的，只有 next build 的 SWC 折叠会出错。）
  // 改法：去掉 defs / 渐变，用纯色背景 + 数组拼接，规避字面量折叠。
  const BG = "#F0F5FF";
  const parts: string[] = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">');
  parts.push('<rect width="' + w + '" height="' + h + '" fill="' + BG + '"/>');
  parts.push(noise);
  parts.push(dots);
  parts.push(chars);
  parts.push('</svg>');
  return parts.join("");
}

/** GET /api/auth/captcha - 取新验证码（只回图片，绝不回答案文本） */
export async function GET(_req: NextRequest) {
  const { token, text } = issueCaptcha(4);
  return NextResponse.json(
    { token, svg: genSvg(text) },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
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
