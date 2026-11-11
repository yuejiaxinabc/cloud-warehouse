import { businessAccess, assertWarehouseAllowed, checkZone, checkLocation, warehouseWhere } from '@/app/api/warehouse/access';
import { getServerSession } from 'next-auth';
import { requireRole } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { safeErrorMessage, handleApiError } from '@/lib/errors';
import { writeLog, getClientIp } from '@/lib/log';

/**
 * PUT /api/warehouse/boxes/[id] - 停用/启用单个货位
 * body: { status: 0|1, remark? }
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // v1.2.1：仓库结构写操作限 admin / 仓库主管（P0-1）
    await requireRole('admin', 'wh_manager');
    const { session, scope } = await businessAccess();
    const id = params.id;
    const body = await req.json();
    const status = body.status !== undefined ? Number(body.status) : null;

    if (status !== 0 && status !== 1) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "status 必须为 0(停用) 或 1(启用)" }),
        { status: 400 }
      );
    }

    const box = await prisma.box.findUnique({ where: { id: BigInt(id) } });
    if (!box) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "货位不存在" }),
        { status: 404 }
      );
    }

    await checkLocation(scope, box.locationId);
    const updated = await prisma.box.update({
      where: { id: BigInt(id) },
      data: {
        status,
        remark: body.remark !== undefined ? body.remark : box.remark,
      },
    });

    await writeLog({ module: 'warehouse', action: 'box_status', userId: (session.user as { id: string }).id, ip: getClientIp(), refType: 'box', refId: BigInt(id), content: `盒子 ${id} 状态改为 ${status}` });
    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: status === 0 ? "货位已停用" : "货位已恢复使用",
      data: updated,
    }));
  } catch (error: any) {
    console.error("Box update API error:", error);
    return handleApiError(error);
  }
}
