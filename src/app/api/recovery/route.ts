import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAuth } from '@/lib/auth-guard';

/**
 * GET /api/recovery - 启动恢复检查
 * 检查服务器异常重启后是否有未完成的单据，返回需要处理的单据列表
 */
export async function GET(_request: NextRequest) {
    await requireAuth(_request);
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    // 查找所有 DRAFT/PROCESSING 状态的单据（可能因服务器重启而中断）
    const [draftInbound, draftOutbound, processingInbound, processingOutbound] = await Promise.all([
      prisma.inboundOrder.findMany({
        where: { status: 'DRAFT' },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outboundOrder.findMany({
        where: { status: 'DRAFT' },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inboundOrder.findMany({
        where: { status: 'PROCESSING' },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outboundOrder.findMany({
        where: { status: 'PROCESSING' },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const summary = {
      draftInbound: draftInbound.length,
      draftOutbound: draftOutbound.length,
      processingInbound: processingInbound.length,
      processingOutbound: processingOutbound.length,
      total: draftInbound.length + draftOutbound.length + processingInbound.length + processingOutbound.length,
    };

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        summary,
        draftInbound,
        draftOutbound,
        processingInbound,
        processingOutbound,
      },
    }));
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/recovery - 处理恢复操作
 * body: { action: 'complete' | 'cancel', orderType: 'inbound' | 'outbound', orderId: number }
 */
export async function POST(request: NextRequest) {
    await requireAuth(_request);
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { action, orderType, orderId } = body;

    if (!action || !orderType || !orderId) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }

    const status = action === 'complete' ? 'COMPLETED' : 'CANCELLED';

    if (orderType === 'inbound') {
      await prisma.inboundOrder.update({
        where: { id: BigInt(orderId) },
        data: { status },
      });
    } else if (orderType === 'outbound') {
      await prisma.outboundOrder.update({
        where: { id: BigInt(orderId) },
        data: { status },
      });
    } else {
      return NextResponse.json({ success: false, error: '无效的单据类型' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `单据已${status === 'COMPLETED' ? '完成' : '取消'}` });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
