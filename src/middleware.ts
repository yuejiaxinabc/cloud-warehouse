import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}



// === 速率限制 ===
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function getRateLimitKey(req: NextRequest, prefix: string): string {
  // 优先信任 nginx 设置的 X-Real-IP（$remote_addr，不可伪造）；
  // 其次取 X-Forwarded-For 的【最后一段】（nginx 用 $proxy_add_x_forwarded_for 把真实 IP 追加在末尾，
  // 第一段是客户端可伪造的——旧实现取第一段导致限流可被 XFF 伪造绕过，FIX-2026-1004）
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return `${prefix}:${realIp.trim()}`;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length) return `${prefix}:${parts[parts.length - 1]}`;
  }
  return `${prefix}:unknown`;
}

function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

// === CSRF 防护 ===
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const ALLOWED_ORIGINS = [
  process.env.NEXTAUTH_URL || '',
  process.env.NEXT_PUBLIC_APP_URL || '',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // 仅保留 HTTPS 来源；http 明文条目已移除（线上 80 端口一律 301 到 https），FIX-2026-1006
  'https://warehouse.yuejiaxin.ln.cn',
  // 微信小程序（真机/开发者工具请求会带 servicewechat.com 来源）
  'https://servicewechat.com',
].filter(Boolean);

// 公开 API（不需要登录）
const PUBLIC_API = [
  "/api/auth/login",
  "/api/auth/reset-password",
  "/api/auth/captcha",
  "/api/auth/login-check",
  "/api/auth/reset-password",
  "/api/auth/admin-reset",
  "/api/settings/system",
  "/api/v1/mp/login",
];

// 公开前端页面
const PUBLIC_PAGES = ["/login", "/reset-password", "/terms", "/privacy"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静态资源直接放行
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|css|js|html|txt|woff2?|mp4|webm)$/)) {
    return NextResponse.next();
  }

  // === 速率限制（在认证检查之前） ===
  if (pathname.startsWith('/api/auth')) {
    const key = getRateLimitKey(request, 'auth');
    if (!checkRateLimit(key, 30, 60 * 1000)) {
      return NextResponse.json(
        { success: false, error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  }

  if (pathname.startsWith('/api/')) {
    const key = getRateLimitKey(request, 'api');
    if (!checkRateLimit(key, 300, 60 * 1000)) {
      return NextResponse.json(
        { success: false, error: '请求过于频繁，请稍后再试' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
  }

  // === CSRF 防护（状态变更请求） ===
  if (!SAFE_METHODS.includes(request.method) && pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const origin = request.headers.get('origin') || request.headers.get('referer') || '';
    if (origin) {
      const isAllowed = ALLOWED_ORIGINS.some(ao => origin.startsWith(ao));
      if (!isAllowed) {
        return addSecurityHeaders(NextResponse.json(
          { success: false, error: '请求来源不被允许' },
          { status: 403 }
        ));
      }
    }
  }

  // NextAuth 内部路由放行
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // 公开 API 放行
  if (PUBLIC_API.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // API 路由认证检查
  if (pathname.startsWith("/api/")) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
return addSecurityHeaders(NextResponse.next());
    }
    // 开放接口通道：/api/v1/* 的路由内部自带真实 token 校验
    // （validateApiToken / requireMpToken，Node 运行时），middleware 放行到路由层；
    // 其余路径一律只认 NextAuth 会话，绝不因携带 token 头而放行（FIX-2026-1001）。
    const hasTokenHeader =
      request.headers.get("authorization")?.startsWith("Bearer ") ||
      !!request.headers.get("x-api-token") ||
      !!new URL(request.url).searchParams.get("token");
    if (hasTokenHeader && pathname.startsWith("/api/v1/")) {
      return addSecurityHeaders(NextResponse.next());
    }
    return addSecurityHeaders(NextResponse.json({ success: false, error: "请先登录" }, { status: 401 }));
  }

  // 前端页面认证检查
  const sessionToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (PUBLIC_PAGES.some(p => pathname.startsWith(p))) {
    if (sessionToken && pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|html|txt|woff2?|mp4|webm)).*)"],
};
