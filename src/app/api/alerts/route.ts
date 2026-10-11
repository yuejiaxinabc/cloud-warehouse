import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";

const DEFAULT_LOW_STOCK_THRESHOLD = 10; // 未设安全库存时的默认低库存阈值
const HIGH_VALUE_THRESHOLD = 500000;    // 高库存价值阈值（50万）

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const type = searchParams.get("type") || "all";

    const products = await prisma.product.findMany({
      where: { status: 1 },
      include: {
        inventories: true,
        category: { select: { name: true } },
      },
    });

    const alerts: any[] = [];

    for (const product of products) {
      let totalStock = 0;
      let totalValue = 0;
      product.inventories.forEach(inv => {
        totalStock += Number(inv.onHand || 0);
        totalValue += Number(inv.onHand || 0) * Number(inv.avgCost || 0);
      });

      const safetyStock = product.safetyStock ? Number(product.safetyStock) : 0;
      const threshold = safetyStock > 0 ? safetyStock : DEFAULT_LOW_STOCK_THRESHOLD;

      // 1. 缺货预警（库存为零）
      if (totalStock === 0) {
        alerts.push({
          id: `out-${product.id}`,
          level: "CRITICAL",
          title: "缺货预警",
          content: `${product.name}（${product.code}）库存为零，请及时补货`,
          productId: Number(product.id),
          productName: product.name,
          productCode: product.code,
          category: product.category?.name || "-",
          currentStock: 0,
          safetyStock: threshold,
          totalValue: 0,
          status: "UNREAD",
          createdAt: new Date().toISOString(),
        });
        continue; // 已缺货就不再报低库存
      }

      // 2. 低库存预警（低于安全库存或默认阈值）
      if (totalStock <= threshold) {
        alerts.push({
          id: `low-${product.id}`,
          level: totalStock <= Math.floor(threshold / 2) ? "CRITICAL" : "WARNING",
          title: "库存不足",
          content: `${product.name}（${product.code}）当前库存 ${totalStock}，${safetyStock > 0 ? '安全库存' : '低库存阈值'} ${threshold}`,
          productId: Number(product.id),
          productName: product.name,
          productCode: product.code,
          category: product.category?.name || "-",
          currentStock: totalStock,
          safetyStock: threshold,
          totalValue: Math.round(totalValue * 100) / 100,
          status: "UNREAD",
          createdAt: new Date().toISOString(),
        });
      }

      // 3. 高库存价值预警
      if (totalValue > HIGH_VALUE_THRESHOLD) {
        alerts.push({
          id: `value-${product.id}`,
          level: totalValue > 1000000 ? "CRITICAL" : "WARNING",
          title: "高库存价值",
          content: `${product.name}（${product.code}）库存价值 ¥${Math.round(totalValue).toLocaleString()}，请关注`,
          productId: Number(product.id),
          productName: product.name,
          productCode: product.code,
          category: product.category?.name || "-",
          currentStock: totalStock,
          safetyStock: threshold,
          totalValue: Math.round(totalValue * 100) / 100,
          status: "UNREAD",
          createdAt: new Date().toISOString(),
        });
      }
    }

    // 按严重程度排序
    const levelOrder: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    alerts.sort((a, b) => (levelOrder[a.level] || 3) - (levelOrder[b.level] || 3));

    // 按类型过滤
    let filteredAlerts = alerts;
    if (type === "low") {
      filteredAlerts = alerts.filter(a => a.title.includes("库存不足") || a.title.includes("缺货"));
    } else if (type === "out") {
      filteredAlerts = alerts.filter(a => a.title.includes("缺货"));
    } else if (type === "value") {
      filteredAlerts = alerts.filter(a => a.title.includes("高库存"));
    }

    const total = filteredAlerts.length;
    const items = filteredAlerts.slice(0, pageSize);

    return NextResponse.json({ 
      success: true, 
      data: serializeBigInt({ 
        items, 
        total,
        summary: {
          critical: alerts.filter(a => a.level === "CRITICAL").length,
          warning: alerts.filter(a => a.level === "WARNING").length,
          info: alerts.filter(a => a.level === "INFO").length,
        }
      }) 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
