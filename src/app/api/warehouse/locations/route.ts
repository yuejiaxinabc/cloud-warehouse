import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const zoneId = searchParams.get("zoneId");
    const warehouseId = searchParams.get("warehouseId");

    const where: any = {};
    if (zoneId) {
      where.zoneId = BigInt(zoneId);
    } else if (warehouseId) {
      // 先查该仓库下的所有区域
      const zones = await prisma.zone.findMany({
        where: { warehouseId: BigInt(warehouseId) },
        select: { id: true },
      });
      where.zoneId = { in: zones.map(z => z.id) };
    }

    const locations = await prisma.location.findMany({
      where,
      orderBy: { code: "asc" },
    });

    return NextResponse.json(serializeBigInt({ success: true, data: locations }));
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
    const location = await prisma.location.create({
      data: {
        name: body.name,
        code: body.code,
        zoneId: BigInt(body.zoneId),
        type: body.type || "shelf",
        capacity: body.capacity ? Number(body.capacity) : null,
        remark: body.remark || null,
        status: 1,
      },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: location }));
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
