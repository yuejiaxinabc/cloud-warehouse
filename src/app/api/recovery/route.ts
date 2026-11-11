import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireRole } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';

/**
 * 启动恢复检查（v1.2.1 修复 P1-5）
 *
 * v1.2.0 两个方向都是 500：
 *  - GET 用了 schema 里不存在的 items 关系（真实关系是 inboundItems / outboundItems），
 *    并把 Prisma 原始报错原样回显（Unknown field `items`）；
 *  - POST 里引用了未定义的变量 _request。
 * 另外这是「批量改单据状态」的运维接口，只应对管理员开放。
 */

// 单据只带恢复所需字段，避免重启时把整单明细全量返回
const ORDER_SELECT = {
  id: true,
  orderNo: true,
  status: true,
  warehouseId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * GET /api/recovery - 启动恢复检查
 * 检查服务器异常重启后是否有未完成的单据，返回需要处理的单据列表
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRole('admin');

    // 状态取值以 schema 注释为准：入库 DRAFT/POSTED/CANCELLED，出库 DRAFT/LOCKED/POSTED/CANCELLED。
    // 入库没有 PROCESSING 状态，出库的「处理中」= LOCKED（已锁库待审批/待过账），
    // 服务器重启后最需要人工确认的就是它，放进 processingOutbound 保持前端字段不变。
    const [draftInbound, draftOutbound, processingOutbound] = await Promise.all([
      prisma.inboundOrder.findMany({
        where: { status: 'DRAFT' },
        select: ORDER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outboundOrder.findMany({
        where: { status: 'DRAFT' },
        select: ORDER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.outboundOrder.findMany({
        where: { status: 'LOCKED' },
        select: ORDER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const processingInbound: typeof draftInbound = [];

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
    return handleApiError(error);
  }
}

/**
 * POST /api/recovery - 处理恢复操作
 * body: { action: 'complete' | 'cancel', orderType: 'inbound' | 'outbound', orderId: number }
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole('admin');

    const body = await request.json();
    const { action, orderType, orderId } = body;

    if (!action || !orderType || !orderId) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }
    if (action !== 'complete' && action !== 'cancel') {
      return NextResponse.json({ success: false, error: '无效的操作类型' }, { status: 400 });
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
    return handleApiError(error);
  }
}
