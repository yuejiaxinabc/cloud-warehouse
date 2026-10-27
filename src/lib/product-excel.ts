import ExcelJS from 'exceljs';

/**
 * 商品 Excel 导入导出（FIX-2026-1013）
 *
 * 模板由系统即时生成，且「看仓库下菜」：
 *   - 系统里存在仓库 → 模板多出「仓库」「货位编码」两列，且为必填
 *     （商品必须落到货位，四段编码 区-排-列-位）
 *   - 系统里没有任何仓库 → 这两列不出现，用户也不用填
 */

export type ProductColumn = {
  key: string;
  header: string;
  width: number;
  required?: boolean;
  hint?: string;
};

export const BASE_COLUMNS: ProductColumn[] = [
  { key: 'code', header: '商品编码', width: 18, required: true, hint: '唯一，如 RM-001' },
  { key: 'name', header: '商品名称', width: 24, required: true },
  { key: 'barcode', header: '条码', width: 18 },
  { key: 'category', header: '分类', width: 14, hint: '不存在会自动创建' },
  { key: 'unit', header: '单位', width: 10, hint: '不存在会自动创建' },
  { key: 'spec', header: '规格', width: 20 },
  { key: 'brand', header: '品牌', width: 14 },
  { key: 'model', header: '型号', width: 16 },
  { key: 'costMethod', header: '成本方法', width: 14, hint: 'WEIGHTED / FIFO / MONTHLY，留空默认 WEIGHTED' },
  { key: 'defaultCost', header: '默认成本', width: 12 },
  { key: 'salePrice', header: '售价', width: 12 },
  { key: 'safetyStock', header: '安全库存', width: 12 },
  { key: 'enableSerial', header: '启用序列号', width: 14, hint: '是/否' },
  { key: 'enableBatch', header: '启用批次', width: 12, hint: '是/否' },
  { key: 'initialQty', header: '初始数量', width: 12, hint: '填了才会生成库存' },
  { key: 'remark', header: '备注', width: 20 },
];

export const WAREHOUSE_COLUMN: ProductColumn = {
  key: 'warehouse',
  header: '仓库',
  width: 16,
  required: true,
  hint: '必须是系统中已存在的仓库名称或编码',
};

export const LOCATION_COLUMN: ProductColumn = {
  key: 'locationCode',
  header: '货位编码',
  width: 20,
  required: true,
  hint: '四段编码：区-排-列-位，如 A-01-02-03',
};

/** 根据是否存在仓库，决定模板列 */
export function buildColumns(hasWarehouse: boolean): ProductColumn[] {
  if (!hasWarehouse) return [...BASE_COLUMNS];
  // 仓库、货位放在「初始数量」前面，逻辑上连在一起
  const idx = BASE_COLUMNS.findIndex(c => c.key === 'initialQty');
  return [
    ...BASE_COLUMNS.slice(0, idx),
    WAREHOUSE_COLUMN,
    LOCATION_COLUMN,
    ...BASE_COLUMNS.slice(idx),
  ];
}

const REQUIRED_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFF1F0' } };
const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1677FF' } };

/**
 * 生成导入模板
 */
export async function buildTemplate(params: {
  hasWarehouse: boolean;
  warehouses: { name: string; code: string }[];
}): Promise<Buffer> {
  const { hasWarehouse, warehouses } = params;
  const cols = buildColumns(hasWarehouse);

  const wb = new ExcelJS.Workbook();
  wb.creator = '云仓智能仓储管理平台';
  wb.created = new Date();

  // ---------- Sheet1 数据 ----------
  const ws = wb.addWorksheet('商品导入', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));

  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    const spec = cols[colNumber - 1];
    if (spec?.required) {
      cell.note = '必填';
    }
  });

  // 必填列浅红底提示（表头下第 2 行作为示例行，也标出来）
  cols.forEach((c, i) => {
    if (!c.required) return;
    const cell = ws.getRow(2).getCell(i + 1);
    cell.fill = REQUIRED_FILL;
  });

  // 仓库下拉
  if (hasWarehouse && warehouses.length) {
    const wIdx = cols.findIndex(c => c.key === 'warehouse');
    if (wIdx >= 0) {
      const list = warehouses.map(w => w.name).filter(Boolean);
      for (let r = 2; r <= 500; r++) {
        ws.getRow(r).getCell(wIdx + 1).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"' + list.join(',') + '"'],
          showErrorMessage: true,
          errorTitle: '仓库无效',
          error: '请从下拉列表中选择仓库',
        };
      }
    }
  }

  // 是/否 下拉
  for (const key of ['enableSerial', 'enableBatch']) {
    const idx = cols.findIndex(c => c.key === key);
    if (idx < 0) continue;
    for (let r = 2; r <= 500; r++) {
      ws.getRow(r).getCell(idx + 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"是,否"'],
      };
    }
  }

  // ---------- Sheet2 填写说明 ----------
  const help = wb.addWorksheet('填写说明');
  help.columns = [
    { header: '列名', key: 'h', width: 18 },
    { header: '是否必填', key: 'r', width: 12 },
    { header: '说明', key: 'd', width: 60 },
  ];
  help.getRow(1).font = { bold: true };
  for (const c of cols) {
    help.addRow([c.header, c.required ? '必填' : '选填', c.hint || '']);
  }
  help.addRow([]);
  help.addRow(['', '', '']);
  const notes = [
    '1. 商品编码全系统唯一，重复编码会被跳过并在导入结果中提示。',
    hasWarehouse
      ? '2. 商品必须绑定货位：仓库 + 货位编码均为必填。货位编码为四段：区-排-列-位，例如 A-01-02-03。'
      : '2. 系统当前没有任何仓库，因此模板不含「仓库」「货位编码」列。建好仓库后重新下载模板即可。',
    '3. 分类、单位若不存在，系统会自动创建。',
    '4. 初始数量 > 0 时才生成库存记录。',
    '5. 请勿修改表头，从第 2 行开始填写数据。',
  ];
  for (const n of notes) help.addRow(['', '', n]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** 列头 → key 映射，用于解析用户上传的文件 */
export function headerMap(columns: ProductColumn[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of columns) map[c.header] = c.key;
  // 容错：也接受 key 本身当表头
  for (const c of columns) map[c.key] = c.key;
  return map;
}

export function toBool(v: any): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '是' || s === 'true' || s === '1' || s === 'y' || s === 'yes';
}

export function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}