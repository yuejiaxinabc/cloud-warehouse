import { getServerSession } from 'next-auth';
import { NextRequest } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { successResponse, parsePagination } from "@/lib/errors";
import { handleApiError } from "@/lib/errors";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, pageSize, skip } = parsePagination(url.searchParams);
    const userId = url.searchParams.get("userId") ? Number(url.searchParams.get("userId")) : undefined;
    const module = url.searchParams.get("module") || undefined;

    const where: any = {};
    if (userId) where.userId = userId;
    if (module) where.module = module;

    const [list, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip, take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, realName: true } },
        },
      }),
      prisma.operationLog.count({ where }),
    ]);
    
    const formattedList = list.map((item) => ({
      id: Number(item.id),
      userId: item.userId ? Number(item.userId) : null,
      username: item.user?.username || '-',
      realName: item.user?.realName || '-',
      module: item.module,
      action: item.action,
      refType: item.refType,
      refId: item.refId ? Number(item.refId) : null,
      content: item.content,
      ip: item.ip || '-',
      createdAt: item.createdAt,
    }));
    
    return successResponse({ list: formattedList, total, page, pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}
