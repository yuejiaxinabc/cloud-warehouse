import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMpToken, mpErrorResponse } from '@/lib/mp-auth';

/** GET /api/v1/mp/me - 小程序连通性/身份校验 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireMpToken(req);

    let user: any = null;
    if (auth.userId) {
      const u = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { username: true, realName: true, userRoles: { include: { role: { select: { code: true, name: true } } } } },
      });
      if (u) {
        user = {
          username: u.username,
          realName: u.realName,
          roles: u.userRoles.map((ur) => ur.role.name),
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        app: '云仓智能仓储管理平台',
        version: '1.2.0',
        serverTime: new Date().toISOString(),
        user,
      },
      message: '连接成功',
    });
  } catch (error: any) {
    return mpErrorResponse(error);
  }
}
