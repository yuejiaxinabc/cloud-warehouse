import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * Auth.js API 路由
 * 处理登录、登出、session 管理等
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
