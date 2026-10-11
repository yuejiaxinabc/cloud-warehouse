import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * GET /api/labels/templates - 标签模板列表
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return errorResponse('请先登录', 401);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'history') {
      // 打印历史
      const history = await prisma.labelPrintJob.findMany({
        take: 20,
        include: {
          template: true,
          user: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return successResponse(history);
    }

    // 模板列表
    const templates = await prisma.labelTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return successResponse(templates);
  } catch (error) {
    return handleApiError(error);
  }
}
