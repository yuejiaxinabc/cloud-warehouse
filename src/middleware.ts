import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { checkNextAuthSecret } from "@/lib/env-guard";

function addSecurityHeaders(response: NextResponse, isHttps: boolean): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  // FIX-2026-1022：管理后台页面禁止缓存。
  // Next 默认给页面发 s-maxage=31536000，入库/改库存后前端仍拿旧数据，
  // 看起来像「数据没进去」。页面和接口一律 no-store。
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  // FIX-2026-1012：补 HSTS。原实现缺失，且 80 端口仍可访问，会话可被降级到明文。
  if (isHttps) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  return response;
}

/**
 * 解析「用户实际访问的对外地址」。
 *
 * 仅用于拼重定向地址（登录跳转），不参与任何安全判定 ——
 * X-Forwarded-Host 是客户端可伪造的，拿它做同源校验等于没做（见 CSRF 段）。
 */
function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.trim() || request.nextUrl.host;
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || request.nextUrl.protocol.replace(':', '') || 'http';
  if (host) return `${proto}://${host}`;
  const envOrigin = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  return envOrigin || request.nextUrl.origin;
}

function isHttpsRequest(request: NextRequest): boolean {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (proto) return proto === 'https';
  return request.nextUrl.protocol === 'https:';
}

// === 速率限制（Edge 侧第一道，廉价；权威计数在 Node runtime 的 authorize 里） ===
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function getRateLimitKey(req: NextRequest, prefix: string): string {
  // 优先信任 nginx $remote_addr 覆写的 X-Real-IP（客户端不可伪造）；
  // 其次取 X-Forwarded-For 最后一段（nginx $proxy_add_x_forwarded_for 追加在末尾，
  // 第一段客户端可伪造 —— 旧实现取第一段，限流可被绕过，FIX-2026-1004）
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

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

// === CSRF 防护 ===
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * 可信来源白名单 —— 全部来自服务端配置，绝不由请求头推导。
 *
 * FIX-2026-1012（CSRF 绕过）：
 * 旧实现 isSameOrigin(source, request) 把请求方 Origin 与 getRequestOrigin(request) 比对，
 * 而后者优先读 X-Forwarded-Host。攻击者只要同时伪造
 *   Origin: https://evil.example.com
 *   X-Forwarded-Host: evil.example.com
 * 两者就"同源"判定通过，CSRF 防护完全失效。
 * 现改为：白名单只来自 env；配置存在时不命中即拒绝（fail-closed）。
 */
const EXTRA_ALLOWED_ORIGINS: string[] = [
  // 跨域但必须放行的来源（小程序真机请求会带 servicewechat.com）
  'https://servicewechat.com',
  process.env.NEXTAUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  ...(process.env.APP_ALLOWED_ORIGINS || '').split(','),
]
  .filter(Boolean)
  .map(o => (o as string).trim().replace(/\/$/, ""))
  .filter(Boolean);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const https = isHttpsRequest(request);

  // 静态资源直接放行
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|css|js|html|txt|woff2?|mp4|webm)$/)) {
    return NextResponse.next();
  }

  // 密钥不合格 → 全站拒绝服务（fail-closed）。
  // instrumentation.ts 里的启动检查只会被 Next 记日志、进程照旧起来，
  // 所以真正的闸门放在这里：只要 NEXTAUTH_SECRET 不合格，一律 503。
  const secretCheck = checkNextAuthSecret(process.env.NEXTAUTH_SECRET);
  if (!secretCheck.ok) {
    return new NextResponse(
      JSON.stringify({ success: false, error: "服务暂不可用，请联系管理员" }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } }
    );
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
    let sourceOrigin = request.headers.get('origin') || '';
    const referer = request.headers.get('referer');
    if (!sourceOrigin && referer) {
      try {
        sourceOrigin = new URL(referer).origin;
      } catch {
        // referer 非法 → 按无来源处理
      }
    }

    // 同源判定：Origin 的 host 必须等于请求实际的 Host。
    // 浏览器无法伪造 Host（它来自用户实际访问的 URL），这是安全的比对基准；
    // 而 X-Forwarded-Host 是普通请求头，客户端可随意设置 —— 旧实现用它做基准，
    // 伪造 Origin 与 X-Forwarded-Host 一致即可绕过（FIX-2026-1012）。
    // 协议不参与比较：nginx 终止 TLS 后 Origin 是 https 而内部 proto 是 http。
    if (sourceOrigin) {
      let allowed = false;
      try {
        const srcHost = new URL(sourceOrigin).host;
        const reqHost = request.headers.get('host') || '';
        allowed = !!srcHost && !!reqHost && srcHost === reqHost;
      } catch {
        allowed = false;
      }
      if (!allowed && EXTRA_ALLOWED_ORIGINS.length > 0) {
        allowed = EXTRA_ALLOWED_ORIGINS.includes(sourceOrigin);
      }
      if (!allowed) {
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: '请求来源不被允许' }, { status: 403 }),
          https
        );
      }
    }
    // 无 Origin 也无 Referer：交由 session cookie 的 SameSite=Lax 兜底
    // （现代浏览器跨站 POST 必带 Origin，且 SameSite=Lax 不发送 cookie）。
  }

  // NextAuth 内部路由放行
  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // 公开 API —— 精确匹配，避免前缀把未来新增路由一起放开
  const PUBLIC_API_EXACT = new Set([
    "/api/auth/login",
    "/api/auth/reset-password",
    "/api/auth/captcha",
    "/api/auth/login-check",
    "/api/auth/admin-reset",
    "/api/settings/system",
    "/api/v1/mp/login",
  ]);
  if (PUBLIC_API_EXACT.has(pathname)) {
    return addSecurityHeaders(NextResponse.next(), https);
  }

  // API 路由认证检查
  if (pathname.startsWith("/api/")) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
      return addSecurityHeaders(NextResponse.next(), https);
    }
    // /api/v1/* 的路由内部自带 token 校验，middleware 仅放行到路由层；
    // 其余路径只认 NextAuth 会话（FIX-2026-1001）。
    const hasTokenHeader =
      request.headers.get("authorization")?.startsWith("Bearer ") ||
      !!request.headers.get("x-api-token") ||
      !!request.nextUrl.searchParams.get("token");
    if (hasTokenHeader && pathname.startsWith("/api/v1/")) {
      return addSecurityHeaders(NextResponse.next(), https);
    }
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: "请先登录" }, { status: 401 }),
      https
    );
  }

  // 前端页面认证检查
  const sessionToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const PUBLIC_PAGES = ["/login", "/reset-password", "/terms", "/privacy"];
  if (PUBLIC_PAGES.some(p => pathname.startsWith(p))) {
    if (sessionToken && pathname === "/login") {
      return NextResponse.redirect(new URL("/", getRequestOrigin(request)));
    }
    return addSecurityHeaders(NextResponse.next(), https);
  }

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", getRequestOrigin(request)));
  }

  return addSecurityHeaders(NextResponse.next(), https);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|css|js|html|txt|woff2?|mp4|webm)).*)"],
};
