import { NextRequest } from 'next/server';
import { requirePermission, getSessionChecked } from '@/lib/auth-guard';
import { authOptions } from '@/lib/auth';
import { AlertService } from '@/services/alert.service';
import { idSchema } from '@/lib/validators';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';

/**
 * PUT /api/alerts/[id] - 标记已读/解决
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionChecked();
    if (!session) return errorResponse('请先登录', 401);
    // v1.2.1：预警处理（确认/忽略）需 alert:manage
    await requirePermission('alert:manage');

    const { id } = idSchema.parse({ id: params.id });
    const body = await request.json();

    if (body.action === 'resolve') {
      await AlertService.resolve(id);
      return successResponse(null, '预警已解决');
    }

    await AlertService.markRead(id);
    return successResponse(null, '预警已标记已读');
  } catch (error) {
    return handleApiError(error);
  }
}
