import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

/**
 * PUT /api/warehouse/locations/[id] - 停用/启用整个货位（级联其下所有货位）
 * body: { status: 0|1, remark? }
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const body = await req.json();
    const status = body.status !== undefined ? Number(body.status) : null;

    if (status !== 0 && status !== 1) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "status 必须为 0(停用) 或 1(启用)" }),
        { status: 400 }
      );
    }

    const location = await prisma.location.findUnique({
      where: { id: BigInt(id) },
      include: { _count: { select: { boxes: true } } },
    });
    if (!location) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "货位不存在" }),
        { status: 404 }
      );
    }

    // 事务：更新货位状态 + 级联更新所有货位状态
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.location.update({
        where: { id: BigInt(id) },
        data: {
          status,
          remark: body.remark !== undefined ? body.remark : location.remark,
        },
      });

      const boxResult = await tx.box.updateMany({
        where: { locationId: BigInt(id) },
        data: { status },
      });

      return { location: updated, boxCount: boxResult.count };
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: status === 0
        ? `货位已停用，其下 ${result.boxCount} 个货位同步停用`
        : `货位已恢复使用，其下 ${result.boxCount} 个货位同步恢复`,
      data: result,
    }));
  } catch (error: any) {
    console.error("Location update API error:", error);
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
