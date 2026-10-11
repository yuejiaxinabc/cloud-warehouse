import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      return NextResponse.json(
        serializeBigInt({ success: false, error: "缺少仓库ID" }),
        { status: 400 }
      );
    }

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
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
    return NextResponse.json(serializeBigInt({ success: true, data: zone }));
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
