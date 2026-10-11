import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids, field, value } = body;

    if (!ids || !Array.isArray(ids) || !field) {
      return NextResponse.json({ success: false, error: "参数不完整" }, { status: 400 });
    }

    const result = await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { [field]: value },
    });

    return NextResponse.json({ success: true, data: serializeBigInt({ count: result.count }) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
