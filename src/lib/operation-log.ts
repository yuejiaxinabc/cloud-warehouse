import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
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
    const session = await getServerSession();
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
    const ua = headersList.get('user-agent') || '';
    
    await prisma.operationLog.create({
      data: {
        operatorId: session?.user?.id ? BigInt(session.user.id as any) : null,
        action: params.action,
        entityType: params.entityType,
        entityId: BigInt(params.entityId),
        oldData: params.oldData ? JSON.stringify(params.oldData) : undefined,
        newData: params.newData ? JSON.stringify(params.newData) : undefined,
        ipAddress: ip,
        userAgent: ua,
      }
    });
  } catch (e) {
    console.error('Failed to log operation:', e);
  }
}
