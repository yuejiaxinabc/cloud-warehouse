import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from '@/lib/auth';
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { requireAuth } from '@/lib/auth-guard';

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

      // 2. 创建默认货架 A-M（13个）
      const shelfLetters = 'ABCDEFGHIJKLM'.split('');
      for (const letter of shelfLetters) {
        const zone = await tx.zone.create({
          data: {
            name: `${letter}货架`,
            code: letter,
            warehouseId: warehouse.id,
            type: 'storage',
            status: 1,
          },
        });

        // 3. 为每个货架创建 10列 × 10层 = 100 个货位
        // 每个货位的编码如 A-1-1，内部有10个货位（A-1-1-1 到 A-1-1-10）
        const locations = [];
        for (let col = 1; col <= 10; col++) {
          for (let row = 1; row <= 10; row++) {
            locations.push({
              name: `${letter}-${col}-${row}`,
              code: `${letter}-${col}-${row}`,
              zoneId: zone.id,
              type: 'shelf' as const,
              capacity: 10, // 每个货位10个货位
              status: 1,
            });
          }
        }
        
        // 批量创建货位
        await tx.location.createMany({
          data: locations,
        });

        // 4. 为每个货位创建10个小货位（实体化，支持单独停用）
        const createdLocations = await tx.location.findMany({
          where: { zoneId: zone.id },
          orderBy: { id: "asc" },
        });
        const boxes: any[] = [];
        for (const loc of createdLocations) {
          for (let b = 1; b <= 10; b++) {
            boxes.push({
              locationId: loc.id,
              code: `${loc.code}-${b}`,
              status: 1,
            });
          }
        }
        await tx.box.createMany({
          data: boxes,
        });
      }

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
