import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, handleApiError } from '@/lib/errors';
import { requireAuth } from '@/lib/auth-guard';

/**
 * POST /api/cost-snapshots/generate - Generate monthly cost snapshots
 */
export async function POST(request: NextRequest) {
    await requireAuth(request);
  try {
    const body = await request.json();
    const { period } = body; // format: 2026-08
    
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return errorResponse('请输入正确的月份格式 (YYYY-MM)', 400);
    }

    // Get last day of month 23:59:59
    const [year, month] = period.split('-').map(Number);
    const lastDay = new Date(year, month, 0);
    const endDate = new Date(year, month - 1, lastDay.getDate(), 23, 59, 59);

    // Get all active products with inventory
    const products = await prisma.product.findMany({
      where: { status: 1 },
      include: { inventories: true },
    });

    let created = 0;
    let updated = 0;

    for (const product of products) {
      // Get current inventory
      let currentQty = 0;
      let currentAmount = 0;
      
      for (const inv of product.inventories) {
        const qty = Number(inv.onHand || 0);
        const avgCost = inv.avgCost ? Number(inv.avgCost) : 0;
        currentQty += qty;
        currentAmount += qty * avgCost;
      }

      // Query inbound records for the month
      const inboundItems = await prisma.inboundItem.findMany({
        where: {
          productId: product.id,
          order: {
            status: 'POSTED',
            postedAt: {
              gte: new Date(year, month - 1, 1),
              lte: endDate,
            },
          },
        },
      });

      let inQty = 0;
      let inAmount = 0;
      for (const item of inboundItems) {
        inQty += Number(item.quantity || 0);
        inAmount += Number(item.quantity || 0) * Number(item.costPrice || 0);
      }

      // Query outbound records for the month
      const outboundItems = await prisma.outboundItem.findMany({
        where: {
          productId: product.id,
          order: {
            status: 'POSTED',
            postedAt: {
              gte: new Date(year, month - 1, 1),
              lte: endDate,
            },
          },
        },
      });

      let outQty = 0;
      let outAmount = 0;
      for (const item of outboundItems) {
        outQty += Number(item.quantity || 0);
        outAmount += Number(item.quantity || 0) * Number(item.costPrice || 0);
      }

      // Calculate beginning balance: end - in + out
      let beginQty = currentQty - inQty + outQty;
      let beginAmount = currentAmount - inAmount + outAmount;
      
      // If negative, set to 0 (no previous inventory)
      if (beginQty < 0) beginQty = 0;
      if (beginAmount < 0) beginAmount = 0;

      // Calculate average cost
      const avgCost = currentQty > 0 ? currentAmount / currentQty : null;

      // Create or update snapshot
      const existing = await prisma.costSnapshot.findFirst({
        where: {
          productId: product.id,
          period: period,
        },
      });

      const snapshotData = {
        productId: product.id,
        period,
        beginQty: beginQty || null,
        beginAmount: beginAmount || null,
        inQty: inQty || null,
        inAmount: inAmount || null,
        outQty: outQty || null,
        outAmount: outAmount || null,
        endQty: currentQty || null,
        endAmount: currentAmount || null,
        avgCost: avgCost,
        createdAt: endDate,
      };

      if (existing) {
        await prisma.costSnapshot.update({
          where: { id: existing.id },
          data: snapshotData,
        });
        updated++;
      } else {
        await prisma.costSnapshot.create({
          data: snapshotData,
        });
        created++;
      }
    }

    return successResponse({
      period,
      endDate: endDate.toISOString(),
      created,
      updated,
      totalProducts: products.length,
    }, `成本快照生成成功: 新增${created}条, 更新${updated}条`);
  } catch (error) {
    return handleApiError(error);
  }
}
