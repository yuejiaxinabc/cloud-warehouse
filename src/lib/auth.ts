import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';

// 登录失败锁定机制
const loginAttempts = new Map<string, { count: number; lastAttempt: Date }>();
const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 30 * 60 * 1000; // 30分钟

function checkLoginLock(username: string): { locked: boolean; remainingTime?: number } {
  const attempt = loginAttempts.get(username);
  if (!attempt) return { locked: false };
  
  if (attempt.count >= MAX_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attempt.lastAttempt.getTime();
    if (timeSinceLastAttempt < LOCK_DURATION) {
      return { 
        locked: true, 
        remainingTime: Math.ceil((LOCK_DURATION - timeSinceLastAttempt) / 60000) 
      };
    } else {
      loginAttempts.delete(username);
      return { locked: false };
    }
  }
  
  return { locked: false };
}

function recordLoginAttempt(username: string, success: boolean) {
  if (success) {
    loginAttempts.delete(username);
    return;
  }
  
  const attempt = loginAttempts.get(username);
  if (attempt) {
    attempt.count += 1;
    attempt.lastAttempt = new Date();
  } else {
    loginAttempts.set(username, { count: 1, lastAttempt: new Date() });
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: '账号密码',
      credentials: {
        username: { label: '用户名', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        const username = String(credentials?.username || '').trim();
        const password = String(credentials?.password || '');
        if (!username || !password) {
          throw new Error('请输入用户名和密码');
        }
        
        // 检查登录锁定
        const lockStatus = checkLoginLock(username);
        if (lockStatus.locked) {
          throw new Error(`登录失败次数过多，请${lockStatus.remainingTime}分钟后再试`);
        }
        
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
        
        if (!user) {
          recordLoginAttempt(username, false);
          throw new Error('用户名或密码错误');
        }
        
        if (user.status !== 1) {
          throw new Error('用户已被禁用');
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
          recordLoginAttempt(username, false);
          const attempts = loginAttempts.get(username)?.count || 0;
          const remaining = MAX_ATTEMPTS - attempts;
          if (remaining > 0) {
            throw new Error(`密码错误，还剩${remaining}次尝试机会`);
          } else {
            throw new Error(`登录失败次数过多，请${LOCK_DURATION / 60000}分钟后再试`);
          }
        }
        
        // 登录成功，清除失败记录
        recordLoginAttempt(username, true);
                
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
    maxAge: 24 * 60 * 60,  // 24小时
  },
  jwt: { maxAge: 24 * 60 * 60 },
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
  url: process.env.NEXTAUTH_URL || process.env.AUTH_URL,
};

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes(required) || permissions.includes('*');
}

export function hasRole(roles: string[], required: string): boolean {
  return roles.includes(required) || roles.includes('ADMIN');
}

// 获取当前登录用户（用于API路由）
export async function getSessionUser() {
  const { getServerSession } = await import('next-auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: Number((session.user as any).id),
    username: (session.user as any).username,
    roles: (session.user as any).roles || [],
    permissions: (session.user as any).permissions || [],
  };
}
