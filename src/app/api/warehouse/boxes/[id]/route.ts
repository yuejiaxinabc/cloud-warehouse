import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

/**
 * PUT /api/warehouse/boxes/[id] - 停用/启用单个货位
 * body: { status: 0|1, remark? }
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
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

    const updated = await prisma.box.update({
      where: { id: BigInt(id) },
      data: {
        status,
        remark: body.remark !== undefined ? body.remark : box.remark,
      },
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      code: 0,
      message: status === 0 ? "货位已停用" : "货位已恢复使用",
      data: updated,
    }));
  } catch (error: any) {
    console.error("Box update API error:", error);
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
