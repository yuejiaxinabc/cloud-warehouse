import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { requireAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
    await requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get("keyword") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "15");

    const where: any = {};
    if (keyword) where.orderNo = { contains: keyword };

    const [items, total] = await Promise.all([
      prisma.inboundOrder.findMany({
        where,
        include: { warehouse: true, inboundItems: { include: { product: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: "desc" },
      }),
      prisma.inboundOrder.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: serializeBigInt({ items, total, page, pageSize }) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
    await requireAuth(req);
  try {
    const body = await req.json();
    const { type, warehouseId, items, remark } = body;

    if (!type || !warehouseId) {
      return NextResponse.json({ success: false, error: "类型和仓库为必填" }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
    const count = await prisma.inboundOrder.count({
      where: { orderNo: { startsWith: "RK" + dateStr } },
    });
    const orderNo = "RK" + dateStr + "-" + String(count + 1).padStart(4, "0");

    const order = await prisma.inboundOrder.create({
      data: {
        orderNo, type: type.toUpperCase(), warehouseId: Number(warehouseId),
        status: "DRAFT", remark: remark || null,
        inboundItems: items && items.length > 0 ? {
          create: items.map((it: any) => ({
            productId: Number(it.productId),
            quantity: Number(it.planQty || it.quantity),
            costPrice: it.unitPrice ? Number(it.unitPrice) : null,
            lotNumber: it.batchNo || null,
          })),
        } : undefined,
      },
      include: { inboundItems: true },
    });

    return NextResponse.json({ success: true, data: serializeBigInt(order) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
