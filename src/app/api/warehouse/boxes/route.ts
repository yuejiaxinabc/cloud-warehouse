import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

/**
 * GET /api/warehouse/boxes?locationId=X - 获取某货位下的所有货位（含停用状态）
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");

    if (!locationId) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "缺少货位ID" }),
        { status: 400 }
      );
    }

    const boxes = await prisma.box.findMany({
      where: { locationId: BigInt(locationId) },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(
      serializeBigInt({
        success: true,
        data: boxes.map((b) => ({
          id: b.id.toString(),
          code: b.code,
          status: b.status,
          remark: b.remark,
        })),
      })
    );
  } catch (error: any) {
    console.error("Box list API error:", error);
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
