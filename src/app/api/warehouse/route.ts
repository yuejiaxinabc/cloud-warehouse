import { businessAccess, warehouseWhere, assertWarehouseAllowed } from './access';
import { Prisma } from '@prisma/client';
import { ForbiddenError } from '@/lib/errors';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { requireAuth, requireRole } from '@/lib/auth-guard';
import { ensureShelves } from '@/lib/shelf-init';
import { writeLog, getClientIp } from '@/lib/log';
import { handleApiError } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess();
    // v1.2.1（P1-9）：只取必要字段 + _count，去掉 zones 全量与 inventories 全量。
    // 原来 26 个 zone 完整记录 + 每行库存连整条商品对象一起序列化，单次 19.9KB，
    // 而页面只用到 zoneCount / locationCount / productCount / totalQty / totalValue。
    const [warehouses, stockAgg, locationAgg] = await Promise.all([
      prisma.warehouse.findMany({
        where: warehouseWhere(scope),
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          contact: true,
          phone: true,
          status: true,
          remark: true,
          imageUrl: true,
          useLocation: true,
          department: true,
          shift: true,
          recipientName: true,
          recipientQty: true,
          deptManager: true,
          recipientTime: true,
          createdAt: true,
          updatedAt: true,
          // v1.2.3 数据权限：仓库归属组织
          orgId: true,
          organization: { select: { id: true, name: true } },
          _count: { select: { zones: true, inventories: true } },
        },
      }),
      // 库存总量/总值用一条 GROUP BY 算，避免把每个仓库的库存行都拉进内存
      prisma.$queryRaw<Array<{ warehouse_id: bigint; qty: any; value: any }>>`
        SELECT warehouse_id, SUM(on_hand) AS qty, SUM(on_hand * COALESCE(avg_cost, 0)) AS value
        FROM inventory
        WHERE ${scope.warehouseIds === null ? Prisma.sql`1=1` : Prisma.sql`warehouse_id IN (${Prisma.join(scope.warehouseIds.length ? scope.warehouseIds : [-1])})`}
        GROUP BY warehouse_id
      `,
      // 货位数按 locations 表精确统计（location_stocks 会因多商品/多批次重复计数）
      prisma.$queryRaw<Array<{ warehouse_id: bigint; cnt: any }>>`
        SELECT z.warehouse_id AS warehouse_id, COUNT(l.id) AS cnt
        FROM locations l
        JOIN zones z ON z.id = l.zone_id
        WHERE ${scope.warehouseIds === null ? Prisma.sql`1=1` : Prisma.sql`z.warehouse_id IN (${Prisma.join(scope.warehouseIds.length ? scope.warehouseIds : [-1])})`}
        GROUP BY z.warehouse_id
      `,
    ]);

    const stockMap = new Map<string, { totalQty: number; totalValue: number }>();
    for (const row of stockAgg) {
      stockMap.set(String(row.warehouse_id), {
        totalQty: Number(row.qty || 0),
        totalValue: Number(row.value || 0),
      });
    }
    const locationMap = new Map<string, number>();
    for (const row of locationAgg) {
      locationMap.set(String(row.warehouse_id), Number(row.cnt || 0));
    }

    // 计算每个仓库的库存价值
    const warehousesWithValue = warehouses.map((wh: any) => {
      const stock = stockMap.get(String(wh.id)) || { totalQty: 0, totalValue: 0 };
      const { _count, ...base } = wh;
      return {
        ...base,
        totalValue: stock.totalValue,
        totalQty: stock.totalQty,
        productCount: _count?.inventories || 0,
        zoneCount: _count?.zones || 0,
        locationCount: locationMap.get(String(wh.id)) || 0,
      };
    });

    return NextResponse.json(serializeBigInt({ success: true, data: warehousesWithValue }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  // v1.2.1：仓库结构的增改属管理动作，admin 与仓库主管可操作（P0-1）
  try {
    const auth = await requireRole('admin', 'wh_manager');
    const { scope } = await businessAccess();
    const body = await req.json();
    const uid = (auth.user as { id: string }).id;
    
    if (scope.mode !== 'ALL' && (!body.orgId || !scope.orgIds.includes(Number(body.orgId)))) throw new ForbiddenError('新仓库所属组织不在你的数据权限范围内');
    // 使用事务创建仓库、货架、货位（每个货位10个小货位）
    const result = await prisma.$transaction(async (tx) => {
      // 1. 创建仓库
      const warehouse = await tx.warehouse.create({
        data: {
          name: body.name,
          code: body.code,
          address: body.address || null,
          contact: body.contact || null,
          phone: body.phone || null,
          remark: body.remark || null,
          status: 1,
          // v1.2.3 数据权限：仓库归属组织（可空，空表示未划分，仅 ALL 档位可见）
          orgId: body.orgId ? BigInt(Number(body.orgId)) : null,
        },
      });

      // 2. 创建完整货架：A-Z 共 26 个，每个 10列 × 10位 = 100 个货位
      //    FIX-2026-1014：原来只建到 A-M（13 个），且编码是补零前的 A-1-1，
      //    与四段规则冲突，现在统一走 ensureShelves。
      await ensureShelves(tx, warehouse.id);

      return warehouse;
    });

    // v1.1.1：建仓写审计日志（此前完全没记录，操作日志页永远空白）
    await writeLog({
      module: 'warehouse',
      action: 'create',
      userId: uid,
      ip: getClientIp(),
      content: `新建仓库 ${body.name}（${body.code}），已自动生成 A–Z 26 个货架 × 100 个货位`,
      refType: 'warehouse',
      refId: result.id,
    });

    return NextResponse.json(serializeBigInt({ success: true, data: result }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest) {
  // v1.2.1：仓库结构的增改属管理动作，admin 与仓库主管可操作（P0-1）
  try {
    const auth = await requireRole('admin', 'wh_manager');
    const { scope } = await businessAccess();
    const uid = (auth.user as { id: string }).id;
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json(serializeBigInt({ success: false, error: "缺少ID" }), { status: 400 });

    await assertWarehouseAllowed(scope, Number(id));
    const body = await req.json();
    if (body.orgId !== undefined && scope.mode !== 'ALL' && !scope.orgIds.includes(Number(body.orgId))) throw new ForbiddenError('目标组织不在你的数据权限范围内');
    const warehouse = await prisma.warehouse.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        ...(body.orgId !== undefined ? { orgId: body.orgId ? BigInt(Number(body.orgId)) : null } : {}),
        code: body.code,
        address: body.address || null,
        contact: body.contact || null,
        phone: body.phone || null,
        remark: body.remark || null,
      },
    });
    await writeLog({
      module: 'warehouse',
      action: 'update',
      userId: uid,
      ip: getClientIp(),
      content: `编辑仓库 ${warehouse.name}（${warehouse.code}）`,
      refType: 'warehouse',
      refId: warehouse.id,
    });
    return NextResponse.json(serializeBigInt({ success: true, data: warehouse }));
  } catch (error: any) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // v1.2.1：删仓库不可轻率放行，限 admin 与仓库主管（P0-1）
    const auth = await requireRole('admin', 'wh_manager');
    const { scope } = await businessAccess();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json(serializeBigInt({ success: false, error: "缺少ID" }), { status: 400 });

    await assertWarehouseAllowed(scope, Number(id));
    // 检查仓库是否有库存
    const inventory = await prisma.inventory.findFirst({
      where: { warehouseId: Number(id) },
    });

    if (inventory && Number(inventory.onHand) > 0) {
      return NextResponse.json(serializeBigInt({ 
        success: false, 
        error: "该仓库有库存，无法删除。请先清空库存后再删除。" 
      }), { status: 400 });
    }

    // v1.2.0 软删除：仓库进回收站，货架/货位结构保留（15 天内可恢复）
    await prisma.warehouse.update({
      where: { id: Number(id) },
      data: { deletedAt: new Date() },
    });

    await writeLog({
      module: 'warehouse', action: 'delete',
      userId: (auth.user as { id: string }).id, ip: getClientIp(),
      content: `仓库 ${id} 已移入回收站`, refType: 'warehouse', refId: BigInt(id),
    });
    return NextResponse.json(serializeBigInt({ success: true }));
  } catch (error: any) {
    return handleApiError(error);
  }
}