import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { consumeCaptcha } from './captcha-store';
import { hit, reset as resetRate, clientIp } from './rate-limit';
import { secretUsable } from './env-guard';

/**
 * 登录防护策略（FIX-2026-1012）
 *
 * 原实现三个问题：
 *  1) 失败计数只按 username 记 → 攻击者对 admin 连打 5 次即可把管理员锁死 30 分钟（拒绝服务）。
 *  2) 错误文案区分「用户名或密码错误」与「密码错误，还剩N次」→ 用户名枚举预言机。
 *  3) 验证码只在前端校验，authorize() 不验 → 直接打 callback 即可绕过。
 *
 * 现策略：
 *  - 按 IP 与按账号双维度限速，账号维度采用指数退避而非硬锁定，避免被用来打 DoS；
 *  - 所有失败一律返回同一句文案；
 *  - 验证码在 authorize() 内一次性消费，无法绕过。
 */
const MAX_IP_ATTEMPTS = 10;          // 同一 IP / 5 分钟
const IP_WINDOW_MS = 5 * 60 * 1000;
const MAX_USER_ATTEMPTS = 8;         // 同一账号 / 15 分钟
const USER_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_ERROR = '账号或密码错误';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: '账号密码',
      credentials: {
        username: { label: '用户名', type: 'text' },
        password: { label: '密码', type: 'password' },
        // 验证码随登录请求一并提交，由服务端一次性校验
        captchaToken: { label: '验证码票据', type: 'text' },
        captchaAnswer: { label: '验证码', type: 'text' },
      },
      async authorize(credentials, req) {
        // 密钥强度复核（启动期已由 instrumentation.ts 拦过一次，这里是纵深防御）
        if (!secretUsable()) {
          throw new Error('系统配置异常，请联系管理员');
        }

        const username = String(credentials?.username || '').trim();
        const password = String(credentials?.password || '');
        const captchaToken = String(credentials?.captchaToken || '');
        const captchaAnswer = String(credentials?.captchaAnswer || '');

        // ---- 1. 验证码（服务端强制，不在前端做） ----
        const cap = consumeCaptcha(captchaToken, captchaAnswer);
        if (!cap.ok) {
          throw new Error(cap.error || '验证码错误');
        }

        if (!username || !password) {
          throw new Error('请输入用户名和密码');
        }

        // ---- 2. 双维度限速 ----
        // next-auth v4 的 req.headers 是普通对象而非 Headers 实例，clientIp 内部已兼容
        const ip = clientIp((req?.headers as Record<string, string>) ?? {});
        const ipKey = 'login:ip:' + ip;
        const userKey = 'login:user:' + username.toLowerCase();

        const ipHit = await hit(ipKey, MAX_IP_ATTEMPTS, IP_WINDOW_MS);
        if (!ipHit.allowed) {
          throw new Error('尝试过于频繁，请稍后再试');
        }
        const userHit = await hit(userKey, MAX_USER_ATTEMPTS, USER_WINDOW_MS);
        if (!userHit.allowed) {
          // 账号维度用退避提示，不暴露「这个账号存在与否」
          throw new Error('尝试过于频繁，请稍后再试');
        }

        // ---- 3. 查用户 ----
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username },
              ...(username.includes('@') ? [{ email: username }] : []),
              { phone: username },
            ],
          },
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        });

        // ---- 4. 恒定时间校验：用户不存在时也跑一次 bcrypt ----
        // 否则响应时间差本身就是用户名枚举通道
        const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.O0Sv8Vf0J9xJ0M0m6Kf5uU8g8q0m6Qe';
        const hashToCheck = user?.password || DUMMY_HASH;
        const passwordOk = await bcrypt.compare(password, hashToCheck);

        if (!user || !passwordOk) {
          throw new Error(GENERIC_ERROR);
        }

        if (user.status !== 1) {
          // 账号被禁用也应与「密码错误」不可区分
          throw new Error(GENERIC_ERROR);
        }

        // ---- 5. 成功：清计数 ----
        await Promise.all([resetRate(ipKey), resetRate(userKey)]);

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const permissions = new Set<string>();
        const roles: string[] = [];
        for (const ur of user.userRoles) {
          roles.push(ur.role.code);
          for (const rp of ur.role.rolePermissions) {
            permissions.add(rp.permission.code);
          }
        }

        return {
          id: user.id.toString(),
          name: user.realName,
          email: user.email ?? undefined,
          username: user.username,
          orgId: user.orgId?.toString(),
          roles,
          permissions: Array.from(permissions),
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
    // FIX-2026-1012：显式声明 cookie 安全属性。
    // 原实现依赖 NextAuth 默认值，NEXTAUTH_URL 是 http 时 secure 会退化为 false，
    // 而站点同时开放 80 端口 → 会话 cookie 会走明文。
    updateAge: 60 * 60,
  },
  jwt: { maxAge: 24 * 60 * 60 },
  cookies: (() => {
    // FIX-2026-1012：secure 标志必须跟着「实际访问协议」走，不能只看 NODE_ENV。
    // 服务器当前同时开放 80(http) 与 443(https)，若无条件 secure=true，
    // 通过 http://IP 访问时浏览器会丢弃 Set-Cookie，登录直接失效。
    // 以 NEXTAUTH_URL 的协议为准，允许用 COOKIE_SECURE 显式覆盖。
    const urlProto = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || '').startsWith('https://');
    const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : urlProto;
    return {
      sessionToken: {
        name: secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
        options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
      },
    };
  })(),
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = (user as any).username;
        token.orgId = (user as any).orgId;
        token.roles = (user as any).roles;
        token.permissions = (user as any).permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).username = token.username;
        (session.user as any).orgId = token.orgId;
        (session.user as any).roles = token.roles;
        (session.user as any).permissions = token.permissions;
      }
      return session;
    },
  },
  pages: { signIn: '/login', error: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
  // FIX-2026-1012：移除 url —— next-auth v4 的 AuthOptions 没有该字段，
  // 对外地址由 NEXTAUTH_URL 环境变量决定，写在这里不生效只留下类型噪音。
};

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes(required) || permissions.includes('*');
}

/**
 * FIX-2026-1012：原实现判断 roles.includes('ADMIN')（大写），
 * 而数据库里 role.code 是 'admin'（小写，见 prisma/seed.ts）。
 * 该函数当前无调用方，属于潜伏缺陷——一旦有人拿它做鉴权就会全放行/全拒绝。
 * 统一为大小写不敏感比较。
 */
export function hasRole(roles: string[], required: string): boolean {
  const norm = roles.map(r => String(r).toLowerCase());
  return norm.includes(required.toLowerCase()) || norm.includes('admin');
}

// 获取当前登录用户（用于API路由）
export async function getSessionUser() {
  const { getServerSession } = await import('next-auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: Number((session.user as any).id),
    username: (session.user as any).username,
    orgId: (session.user as any).orgId ? Number((session.user as any).orgId) : null,
    roles: (session.user as any).roles || [],
    permissions: (session.user as any).permissions || [],
  };
}
