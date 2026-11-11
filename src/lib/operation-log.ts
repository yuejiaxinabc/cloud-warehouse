import { prisma } from '@/lib/prisma';
import { getSessionChecked } from './auth-guard';
import { headers } from 'next/headers';

// 记录操作日志
export async function logOperation(params: {
  action: string;
  entityType: string;
  entityId: bigint | number;
  oldData?: any;
  newData?: any;
}): Promise<void> {
  try {
    const session = await getSessionChecked();
    const headersList = headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    const ua = headersList.get('user-agent') || '';
    
    await prisma.operationLog.create({
      data: {
        userId: (session?.user as any)?.id ? BigInt((session!.user as any).id) : null,
        module: params.entityType,
        action: params.action,
        refType: params.entityType,
        refId: BigInt(params.entityId),
        content: JSON.stringify({ oldData: params.oldData, newData: params.newData, userAgent: ua }, (_key, value) => typeof value === 'bigint' ? value.toString() : value),
        ip,
      }
    });
  } catch (e) {
    console.error('Failed to log operation:', e);
  }
}
