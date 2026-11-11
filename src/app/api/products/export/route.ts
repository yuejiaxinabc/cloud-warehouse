import { businessAccess, warehouseWhere, withWarehouseScope } from '@/app/api/warehouse/access';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { buildColumns } from '@/lib/product-excel';
import { buildExportSummary } from '@/services/export.service';

/**
 * GET /api/products/export
 * 导出商品（含库存与货位）。列结构与导入模板对齐，可以「导出→改→再导入」。
 */
export async function GET(req: NextRequest) {
  try {
    const { scope } = await businessAccess('product:view');

    const warehouses = await prisma.warehouse.findMany({
      where: warehouseWhere(scope),
      select: { id: true, name: true, code: true },
      orderBy: { id: 'asc' },
    });
    const hasWarehouse = warehouses.length > 0;

    const products = await prisma.product.findMany({
      orderBy: { code: 'asc' },
      include: {
        category: { select: { name: true } },
        unit: { select: { name: true } },
        inventories: {
          where: withWarehouseScope({}, scope),
          include: {
            warehouse: { select: { name: true } },
            locationStocks: {
              include: { location: { select: { code: true } } },
            },
          },
        },
      },
    });

    const cols = buildColumns(hasWarehouse);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('商品', { views: [{ state: 'frozen', ySplit: 1 }] });

    const headers = cols.map(c => c.header);
    if (hasWarehouse) headers.push('当前库存量', '货位编码(实际)');

    ws.columns = headers.map((h, i) => ({ header: h, key: 'c' + i, width: i < cols.length ? cols[i].width : 16 }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677FF' } };

    for (const p of products) {
      const invRows: { warehouseName: string; locationCode: string; qty: number }[] = [];
      for (const inv of p.inventories) {
        const qty = Number(inv.onHand || 0);
        if (inv.locationStocks.length) {
          for (const ls of inv.locationStocks) {
            invRows.push({
              warehouseName: inv.warehouse?.name || '',
              locationCode: ls.location?.code || '',
              qty: Number(ls.quantity || 0),
            });
          }
        } else {
          invRows.push({ warehouseName: inv.warehouse?.name || '', locationCode: '', qty });
        }
      }

      const baseRow: Record<string, any> = {
        code: p.code,
        name: p.name,
        barcode: p.barcode || '',
        category: p.category?.name || '',
        unit: p.unit?.name || '',
        spec: p.spec || '',
        brand: p.brand || '',
        model: p.model || '',
        costMethod: p.costMethod || 'WEIGHTED',
        defaultCost: p.defaultCost != null ? Number(p.defaultCost) : '',
        salePrice: p.salePrice != null ? Number(p.salePrice) : '',
        safetyStock: p.safetyStock != null ? Number(p.safetyStock) : '',
        enableSerial: p.enableSerial ? '是' : '否',
        enableBatch: p.enableBatch ? '是' : '否',
        initialQty: '',
        remark: p.remark || '',
      };

      if (!invRows.length) {
        ws.addRow(cols.map(c => baseRow[c.key] ?? ''));
        continue;
      }

      for (const inv of invRows) {
        const row: Record<string, any> = { ...baseRow };
        if (hasWarehouse) {
          row.warehouse = inv.warehouseName;
          row.locationCode = inv.locationCode;
        }
        const vals = cols.map(c => row[c.key] ?? '');
        if (hasWarehouse) vals.push(inv.qty, inv.locationCode);
        ws.addRow(vals);
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    // v1.2.4 B：实际导出条数 = 写进 Excel 的数据行数（不含表头）。
    // 一个商品可能占多行（多仓库/多货位），此前文件名用的 products.length
    // 是商品数，会把「15 行」说成「5 条」。本接口导出作用域内全部商品，
    // 无额外查询参数，筛选描述为「全部」；商品数另见 X-Export-Products。
    const rowCount = ws.rowCount - 1;
    const summary = buildExportSummary('PRODUCT', Math.max(0, rowCount), {});
    const filename = `商品导出_${summary.exportedCount}条_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const encoded = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="products.xlsx"; filename*=UTF-8''${encoded}`,
        'Content-Length': String((buf as ArrayBuffer).byteLength),
        // 供前端拼提示用：真实行数 / 商品数 / 中文摘要（中文需编码，响应头只允许 ASCII）
        'X-Export-Count': String(summary.exportedCount),
        'X-Export-Products': String(products.length),
        'X-Export-Summary': encodeURIComponent(summary.message),
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
