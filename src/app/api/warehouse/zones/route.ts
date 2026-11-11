import { businessAccess, assertWarehouseAllowed, withWarehouseScope, checkZone, checkLocation } from '@/app/api/warehouse/access';
import { getServerSession } from 'next-auth';
import { requireRole } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { safeErrorMessage, handleApiError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';

export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess();
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "缺少仓库ID" }),
        { status: 400 }
      );
    }

    await assertWarehouseAllowed(scope, Number(warehouseId));
const zones = await prisma.zone.findMany({
      where: { warehouseId: BigInt(warehouseId) },
      orderBy: { code: "asc" },
      include: {
        _count: {
          select: { locations: true },
        },
      },
    });

    return NextResponse.json(serializeBigInt({ success: true, data: zones }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // v1.2.1：仓库结构写操作限 admin / 仓库主管（P0-1）
    await requireRole('admin', 'wh_manager');
    const { session, scope } = await businessAccess();
    const body = await req.json();
    await assertWarehouseAllowed(scope, Number(body.warehouseId));
    const zone = await prisma.zone.create({
      data: {
        name: body.name,
        code: body.code,
        warehouseId: BigInt(body.warehouseId),
        type: body.type || "storage",
        remark: body.remark || null,
        status: 1,
      },
    });
    await writeLog({ module: 'warehouse', action: 'zone_create', userId: (session.user as { id: string }).id, ip: getClientIp(), refType: 'zone', refId: zone.id, content: `创建货区 ${zone.code}` });
    return NextResponse.json(serializeBigInt({ success: true, data: zone }));
  } catch (error: any) {
    return handleApiError(error);
  }
}
