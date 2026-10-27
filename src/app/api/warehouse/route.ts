import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { requireAuth } from '@/lib/auth-guard';
import { ensureShelves } from '@/lib/shelf-init';

export async function GET(req: NextRequest) {
    await requireAuth(req);
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { id: "asc" },
      include: {
        zones: {
          include: {
            _count: { select: { locations: true } },
          },
        },
        inventories: {
          include: {
            product: true,
          },
        },
      },
    });

    // 计算每个仓库的库存价值
    const warehousesWithValue = warehouses.map((wh: any) => {
      const totalValue = wh.inventories.reduce((sum: number, inv: any) => {
        const cost = Number(inv.avgCost || 0);
        const qty = Number(inv.onHand || 0);
        return sum + cost * qty;
      }, 0);
      const totalQty = wh.inventories.reduce((sum: number, inv: any) => {
        return sum + Number(inv.onHand || 0);
      }, 0);
      return {
        ...wh,
        totalValue,
        totalQty,
        productCount: wh.inventories.length,
        zoneCount: wh.zones.length,
        locationCount: wh.zones.reduce((sum: number, z: any) => sum + (z._count?.locations || 0), 0),
      };
    });

    return NextResponse.json(serializeBigInt({ success: true, data: warehousesWithValue }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
    await requireAuth(req);
  try {
    const body = await req.json();
    
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
        },
      });

      // 2. 创建完整货架：A-Z 共 26 个，每个 10列 × 10位 = 100 个货位
      //    FIX-2026-1014：原来只建到 A-M（13 个），且编码是补零前的 A-1-1，
      //    与四段规则冲突，现在统一走 ensureShelves。
      await ensureShelves(tx, warehouse.id);

      return warehouse;
    });

    return NextResponse.json(serializeBigInt({ success: true, data: result }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
    await requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json(serializeBigInt({ success: false, error: "缺少ID" }), { status: 400 });

    const body = await req.json();
    const warehouse = await prisma.warehouse.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        code: body.code,
        address: body.address || null,
        contact: body.contact || null,
        phone: body.phone || null,
        remark: body.remark || null,
      },
    });
    return NextResponse.json(serializeBigInt({ success: true, data: warehouse }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
    await requireAuth(req);
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json(serializeBigInt({ success: false, error: "缺少ID" }), { status: 400 });

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

    // 删除相关数据（按顺序）
    await prisma.$transaction(async (tx) => {
      // 删除货位
      await tx.location.deleteMany({
        where: { zone: { warehouseId: Number(id) } },
      });
      // 删除区域
      await tx.zone.deleteMany({
        where: { warehouseId: Number(id) },
      });
      // 删除库存记录
      await tx.inventory.deleteMany({
        where: { warehouseId: Number(id) },
      });
      // 删除仓库
      await tx.warehouse.delete({
        where: { id: Number(id) },
      });
    });

    return NextResponse.json(serializeBigInt({ success: true }));
  } catch (error: any) {
    return NextResponse.json(serializeBigInt({ success: false, error: error.message }), { status: 500 });
  }
}