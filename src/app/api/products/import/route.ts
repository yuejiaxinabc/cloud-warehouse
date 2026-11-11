import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { businessAccess, warehouseWhere } from '@/app/api/warehouse/access';
import { buildColumns, headerMap, toBool, toNum } from '@/lib/product-excel';
import { normalizeLocationCode } from '@/lib/location-binding';
import { recalcAvailable } from '@/lib/inventory-sync';
import { AppError } from '@/lib/errors';
import {
  requireProductName, requireProductCode, optionalMoney, optionalQty, optionalText,
  PRODUCT_LIMITS,
} from '@/lib/product-guard';
import { sanitizeText } from '@/lib/sanitize';

/**
 * POST /api/products/import
 * 解析上传的 Excel 并导入商品。
 *
 * 规则（FIX-2026-1013）：
 *  - 编码/名称必填，编码已存在则跳过并回报，不覆盖已有数据
 *  - 有仓库时：仓库 + 货位编码必填，且商品必须落到货位
 *    （四段编码；三段旧编码自动补成四段）
 *  - 初始数量 > 0 才生成库存与货位明细
 */
export async function POST(req: NextRequest) {
  try {
    const { scope } = await businessAccess('product:create');

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: '请选择要导入的 Excel 文件' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: '文件不能超过 10MB' }, { status: 400 });
    }

    const warehouses = await prisma.warehouse.findMany({
      where: warehouseWhere(scope),
      select: { id: true, name: true, code: true },
      orderBy: { id: 'asc' },
    });
    const hasWarehouse = warehouses.length > 0;
    const cols = buildColumns(hasWarehouse);
    const hmap = headerMap(cols);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());

    const ws = wb.worksheets.find(w => w.name === '商品导入') || wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ success: false, error: 'Excel 中没有可读的工作表' }, { status: 400 });
    }

    // 表头映射：列号 → 字段 key
    const colIndex: Record<number, string> = {};
    ws.getRow(1).eachCell((cell, i) => {
      const h = String(cell.value ?? '').trim();
      if (hmap[h]) colIndex[i] = hmap[h];
    });

    const known = Object.values(colIndex);
    if (!known.includes('code') || !known.includes('name')) {
      return NextResponse.json(
        { success: false, error: '表头不匹配，请下载最新模板后填写' },
        { status: 400 }
      );
    }
    if (hasWarehouse && (!known.includes('warehouse') || !known.includes('locationCode'))) {
      return NextResponse.json(
        { success: false, error: '系统已有仓库，模板必须包含「仓库」「货位编码」两列，请重新下载模板' },
        { status: 400 }
      );
    }

    type RowResult = { row: number; code: string; name: string; status: 'ok' | 'skip' | 'error'; message: string };
    const results: RowResult[] = [];

    let created = 0, skipped = 0, failed = 0;

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rec: Record<string, any> = {};
      for (const [idxStr, key] of Object.entries(colIndex)) {
        const v = row.getCell(Number(idxStr)).value as any;
        rec[key] = v && typeof v === 'object' && 'text' in v ? v.text : v;
      }

      const code = String(rec.code ?? '').trim();
      const name = String(rec.name ?? '').trim();
      if (!code && !name) continue;   // 空行

      const push = (status: RowResult['status'], message: string) => {
        results.push({ row: r, code, name, status, message });
        if (status === 'ok') created++;
        else if (status === 'skip') skipped++;
        else failed++;
      };

      if (!code) { push('error', '商品编码为空'); continue; }
      if (!name) { push('error', '商品名称为空'); continue; }

      // 严格数字：单元格非空但不是数字（如 ¥100、abc）时报错，不静默当空。
      // 注意 toNum 会去千分位逗号，"2,250,000" 会被解析成 2250000，
      // 再由 optionalMoney 的 1,000,000 上限挡掉，不会悄悄入库。
      const strictNum = (v: unknown, label: string): number | null => {
        if (v === null || v === undefined || v === '') return null;
        const n = toNum(v);
        if (n === null) throw new AppError(`${label}格式不正确`, 400);
        return n;
      };

      try {
        // v1.2.4 B：导入与新建商品走同一套校验（长度、去标签、金额数量
        // >=0 且 <=1,000,000），不合格的行只记 error，不中断整批导入。
        const finalCode = requireProductCode(code);
        const finalName = requireProductName(name);
        const finalDefaultCost = optionalMoney(strictNum(rec.defaultCost, '默认成本'), '默认成本');
        const finalSalePrice = optionalMoney(strictNum(rec.salePrice, '售价'), '售价');
        const finalSafetyStock = optionalQty(strictNum(rec.safetyStock, '安全库存'), '安全库存');
        const finalBarcode = optionalText(rec.barcode, '条码', PRODUCT_LIMITS.barcode);
        const finalSpec = optionalText(rec.spec, '规格说明', PRODUCT_LIMITS.spec);
        const finalBrand = optionalText(rec.brand, '品牌', PRODUCT_LIMITS.brand);
        const finalModel = optionalText(rec.model, '型号', PRODUCT_LIMITS.model);
        const finalRemark = optionalText(rec.remark, '备注', PRODUCT_LIMITS.remark);
        const finalQty = optionalQty(strictNum(rec.initialQty, '初始数量'), '初始数量') ?? 0;

        const exists = await prisma.product.findUnique({ where: { code: finalCode } });
        if (exists) { push('skip', '编码已存在，未覆盖'); continue; }

        // 仓库 + 货位（有仓库时必填）
        let warehouseId: bigint | null = null;
        let locationId: bigint | null = null;
        if (hasWarehouse) {
          const whRaw = String(rec.warehouse ?? '').trim();
          const locRaw = String(rec.locationCode ?? '').trim();
          if (!whRaw) { push('error', '仓库为空'); continue; }
          if (!locRaw) { push('error', '货位编码为空（商品必须绑定货位）'); continue; }

          const wh = warehouses.find(w => w.name === whRaw || w.code === whRaw);
          if (!wh) { push('error', `仓库「${whRaw}」不存在`); continue; }
          warehouseId = wh.id;

          let normCode: string;
          try {
            normCode = normalizeLocationCode(locRaw);
          } catch (e: any) {
            push('error', e.message);
            continue;
          }

          const loc = await prisma.location.findFirst({
            where: { code: normCode, zone: { warehouseId: wh.id } },
            select: { id: true },
          });
          if (!loc) { push('error', `货位「${normCode}」在仓库「${wh.name}」下不存在`); continue; }
          locationId = loc.id;
        }

        // 分类 / 单位：按名称找，没有就建
        let categoryId: bigint | null = null;
        const catName = sanitizeText(rec.category, 100);
        if (catName) {
          const c = await prisma.category.findFirst({ where: { name: catName }, select: { id: true } });
          if (c) categoryId = c.id;
          else {
            const nc = await prisma.category.create({
              data: { name: catName, code: 'CAT-' + Date.now().toString(36) + Math.floor(Math.random() * 100), level: 1 },
              select: { id: true },
            });
            categoryId = nc.id;
          }
        }

        let unitId: bigint | null = null;
        const unitName = sanitizeText(rec.unit, 20);
        if (unitName) {
          const u = await prisma.unit.findFirst({ where: { name: unitName }, select: { id: true } });
          if (u) unitId = u.id;
          else {
            const nu = await prisma.unit.create({
              data: { name: unitName, code: 'U-' + Date.now().toString(36) + Math.floor(Math.random() * 100) },
              select: { id: true },
            });
            unitId = nu.id;
          }
        }

        const costMethod = String(rec.costMethod ?? '').trim().toUpperCase() || 'WEIGHTED';
        const product = await prisma.product.create({
          data: {
            code: finalCode,
            name: finalName,
            barcode: finalBarcode ?? null,
            categoryId,
            unitId,
            spec: finalSpec ?? null,
            brand: finalBrand ?? null,
            model: finalModel ?? null,
            costMethod: ['WEIGHTED', 'FIFO', 'MONTHLY'].includes(costMethod) ? costMethod : 'WEIGHTED',
            defaultCost: finalDefaultCost ?? null,
            salePrice: finalSalePrice ?? null,
            safetyStock: finalSafetyStock ?? null,
            enableSerial: toBool(rec.enableSerial),
            enableBatch: toBool(rec.enableBatch),
            remark: finalRemark ?? null,
            status: 1,
          },
          select: { id: true },
        });

        // 初始库存 + 货位明细
        const qty = finalQty;
        if (warehouseId && locationId && qty > 0) {
          await prisma.$transaction(async (tx) => {
            const inv = await tx.inventory.create({
              data: {
                productId: product.id,
                warehouseId: warehouseId!,
                skuVariantId: 0,
                locationId,
                onHand: qty,
                locked: 0,
                avgCost: finalDefaultCost != null ? String(finalDefaultCost) as any : null,
                version: 0,
              },
            });
            await tx.locationStock.create({
              data: {
                inventoryId: inv.id,
                productId: product.id,
                warehouseId: warehouseId!,
                locationId: locationId!,
                quantity: qty,
              },
            });
            // P1-2：导入建库存也要同步 available（= onHand - locked），否则新导入商品可用量恒为 0
            await recalcAvailable(tx, { id: inv.id });
          });
        }

        push('ok', '导入成功');
      } catch (e: any) {
        push('error', e?.message?.slice(0, 200) || '导入失败');
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: created + skipped + failed,
        created,
        skipped,
        failed,
        hasWarehouse,
        results: results.slice(0, 500),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
