import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, authErrorResponse } from '@/lib/auth-guard';
import ExcelJS from 'exceljs';

const STATUS_TEXT: Record<string, string> = {
  PENDING: '待采购',
  PURCHASING: '采购中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

/**
 * POST /api/purchase-requests/batch-download
 * 管理员批量下载购买申请单（Excel）
 * body: { ids: number[] }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = await req.json();
    const ids: number[] = (body.ids || []).map((n: any) => Number(n)).filter((n: number) => !isNaN(n));

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '请选择要下载的申请单' }, { status: 400 });
    }

    const requests = await prisma.purchaseRequest.findMany({
      where: { id: { in: ids.map((n) => BigInt(n)) } },
      include: {
        warehouse: { select: { name: true, code: true } },
        location: { select: { name: true, code: true } },
        box: { select: { code: true } },
      },
      orderBy: { id: 'desc' },
    });

    if (requests.length === 0) {
      return NextResponse.json({ success: false, error: '未找到对应的申请单' }, { status: 404 });
    }

    // 表头 + 数据行
    const header = [
      '申请单号', '备件名称', '型号', '颜色', '尺寸', '数量',
      '申请人', '状态', '申请时间', '入库仓库', '入库货位', '入库盒子', '关联入库单', '备注',
    ];
    const rows = requests.map((r) => [
      r.requestNo,
      r.name,
      r.model || '',
      r.color || '',
      r.size || '',
      Number(r.quantity),
      r.applicant || '',
      STATUS_TEXT[r.status] || r.status,
      new Date(r.createdAt).toLocaleString('zh-CN', { hour12: false }),
      r.warehouse?.name || '',
      r.location?.code || '',
      r.box?.code || '',
      r.inboundOrderId ? '已入库' : '',
      r.remark || '',
    ]);

    // exceljs 生成工作簿（替代存在已知漏洞的 xlsx 包，FIX-2026-1005）
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('购买申请单');
    const colWidths = [18, 22, 16, 8, 8, 8, 10, 10, 20, 14, 12, 12, 10, 24];
    ws.columns = header.map((h, i) => ({ header: h, key: `c${i}`, width: colWidths[i] }));
    ws.getRow(1).font = { bold: true };
    for (const row of rows) ws.addRow(row);

    const buf = await wb.xlsx.writeBuffer();
    const filename = `购买申请单_${requests.length}条_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const encoded = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="purchase_requests.xlsx"; filename*=UTF-8''${encoded}`,
        'Content-Length': String((buf as ArrayBuffer).byteLength),
      },
    });
  } catch (error: any) {
    return authErrorResponse(error);
  }
}
