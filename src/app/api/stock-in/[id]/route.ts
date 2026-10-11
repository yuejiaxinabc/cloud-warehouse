import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-guard';
import { serializeBigInt } from '@/lib/serialize';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth(req);
  try {
    const id = Number(params.id);
    const order = await prisma.inboundOrder.findUnique({
      where: { id },
      include: {
        warehouse: true,
        supplier: true,
        inboundItems: { include: { product: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: '入库单不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: serializeBigInt(order) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
