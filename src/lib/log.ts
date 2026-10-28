import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

/**
 * 获取客户端真实 IP
 */
export function getClientIp(): string {
  try {
    const h = headers();
    return h.get('x-forwarded-for')?.split(',')[0]?.trim()
      || h.get('x-real-ip')
      || h.get('cf-connecting-ip')
      || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 获取客户端平台标识
 */
export function getClientPlatform(): string {
  try {
    const h = headers();
    return h.get('x-client-platform') || 'web';
  } catch {
    return 'web';
  }
}

export const PLATFORM_NAMES: Record<string, string> = {
  'windows-x86': 'Windows 32位',
  'windows-x64': 'Windows 64位',
  'mac-arm': 'macOS (M系列)',
  'mac-intel': 'macOS (Intel)',
  'ios': 'iOS',
  'android': 'Android',
  'harmonyos': '鸿蒙',
  'web': 'Web',
};

/** 会话里的 id 是字符串，这里统一转成 BigInt；非法值一律写 null，绝不让日志把主流程带崩 */
function toBigIntOrNull(v: number | bigint | string | null | undefined): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  try {
    return BigInt(v as any);
  } catch {
    return null;
  }
}

/**
 * 写操作日志
 * @param module  模块: system/auth/user/role/settings/product/warehouse/category/unit/supplier/stock-in/stock-out/transfer/stocktake/inventory
 * @param action  操作: create/update/delete/login/logout/approve/import/export/adjust/post/cancel
 * @param content 日志内容描述
 * @param userId  操作人ID（可选）
 * @param refType 关联类型（可选）
 * @param refId   关联ID（可选）
 * @param ip      IP地址（可选）
 */
export async function writeLog({
  module,
  action,
  content,
  userId,
  refType,
  refId,
  ip,
}: {
  module: string;
  action: string;
  content?: string;
  userId?: number | bigint | string | null;
  refType?: string;
  refId?: number | bigint | null;
  ip?: string;
}) {
  try {
    await prisma.operationLog.create({
      data: {
        userId: toBigIntOrNull(userId),
        module,
        action,
        refType: refType || null,
        refId: toBigIntOrNull(refId),
        content: content || null,
        ip: ip || null,
      },
    });
  } catch (e) {
    console.error('writeLog error:', e);
  }
}
