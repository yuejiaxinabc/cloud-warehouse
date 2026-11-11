import { prisma } from './prisma';

/**
 * 邮件模板（v1.2.4）
 *
 * 之前的订阅只能填"收件人 + 时间"，邮件正文是代码里拼死的固定表格，管理员无法定制，
 * 也无法说明"这封邮件是什么"。现在改成：
 *   1) 模板独立成表（mail_templates），有编码、名称、主题、HTML 正文；
 *   2) 订阅必须绑定一个模板（ReportSubscription.templateCode），不再允许"填段文字就订"；
 *   3) 渲染只认白名单变量，模板里写了未知变量原样保留并在校验时提示。
 */

export const ALLOWED_VARIABLES = [
  'companyName',
  'reportName',
  'reportType',
  'date',
  'generatedAt',
  'totalItems',
  'lowStockCount',
  'pendingInbound',
  'pendingOutbound',
  'topRows',
  'reportUrl',
  'recipientName',
] as const;

export type TemplateVars = Record<string, string>;

/** 系统内置模板：首次部署时灌入，可改内容但不可删除 */
export const SYSTEM_TEMPLATES = [
  {
    code: 'daily_report',
    name: '库存日报',
    subject: '【{{companyName}}】{{reportName}} · {{date}}',
    variables: 'companyName,reportName,reportType,date,generatedAt,totalItems,lowStockCount,topRows,reportUrl',
    bodyHtml: [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#0B1220;line-height:1.7">',
      '  <h2 style="margin:0 0 8px">{{companyName}} · {{reportName}}</h2>',
      '  <p style="color:#5B6779;margin:0 0 16px">{{reportType}}，生成于 {{generatedAt}}</p>',
      '  <table style="border-collapse:collapse;width:100%;margin-bottom:16px">',
      '    <tr><td style="padding:8px;background:#F8FAFC;border:1px solid #E7EBF0">商品总数</td><td style="padding:8px;border:1px solid #E7EBF0">{{totalItems}}</td>',
      '        <td style="padding:8px;background:#F8FAFC;border:1px solid #E7EBF0">低于安全库存</td><td style="padding:8px;border:1px solid #E7EBF0">{{lowStockCount}}</td></tr>',
      '  </table>',
      '  <h3 style="margin:16px 0 8px">库存概览</h3>',
      '  {{topRows}}',
      '  <p style="margin-top:20px"><a href="{{reportUrl}}" style="color:#2563EB">在系统中查看完整报表</a></p>',
      '  <p style="color:#93A0B4;font-size:12px">本邮件由 {{companyName}} 库存系统自动发送，请勿直接回复。</p>',
      '</div>',
    ].join('\n'),
  },
  {
    code: 'weekly_report',
    name: '库存周报',
    subject: '【{{companyName}}】{{reportName}}（周报）· {{date}}',
    variables: 'companyName,reportName,reportType,date,generatedAt,totalItems,lowStockCount,pendingInbound,pendingOutbound,topRows,reportUrl',
    bodyHtml: [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#0B1220;line-height:1.7">',
      '  <h2 style="margin:0 0 8px">{{companyName}} · 本周库存周报</h2>',
      '  <p style="color:#5B6779;margin:0 0 16px">统计周期截至 {{date}}，生成于 {{generatedAt}}</p>',
      '  <ul>',
      '    <li>商品总数：{{totalItems}}</li>',
      '    <li>低于安全库存：{{lowStockCount}}</li>',
      '    <li>待处理入库单：{{pendingInbound}}，待处理出库单：{{pendingOutbound}}</li>',
      '  </ul>',
      '  <h3 style="margin:16px 0 8px">重点商品</h3>',
      '  {{topRows}}',
      '  <p style="margin-top:20px"><a href="{{reportUrl}}" style="color:#2563EB">查看完整周报</a></p>',
      '</div>',
    ].join('\n'),
  },
  {
    code: 'low_stock_alert',
    name: '库存预警通知',
    subject: '【{{companyName}}】{{lowStockCount}} 个商品低于安全库存',
    variables: 'companyName,date,generatedAt,lowStockCount,topRows,reportUrl',
    bodyHtml: [
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#0B1220;line-height:1.7">',
      '  <h2 style="margin:0 0 8px;color:#DC2626">{{companyName}} · 库存预警</h2>',
      '  <p style="color:#5B6779">截至 {{generatedAt}}，共 {{lowStockCount}} 个商品低于安全库存：</p>',
      '  {{topRows}}',
      '  <p style="margin-top:20px"><a href="{{reportUrl}}" style="color:#2563EB">去补货</a></p>',
      '</div>',
    ].join('\n'),
  },
] as const;

const VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** 渲染模板：只替换白名单变量，未知变量原样保留（便于发现模板写错） */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return String(text || '').replace(VAR_PATTERN, (whole, key: string) => {
    if (!(ALLOWED_VARIABLES as readonly string[]).includes(key)) return whole;
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/** 校验模板里出现的变量是否都在白名单内，返回未知变量列表 */
export function findUnknownVariables(text: string): string[] {
  const found = new Set<string>();
  for (const match of String(text || '').matchAll(VAR_PATTERN)) {
    if (!(ALLOWED_VARIABLES as readonly string[]).includes(match[1])) found.add(match[1]);
  }
  return Array.from(found);
}

export async function loadTemplate(code: string) {
  return prisma.mailTemplate.findUnique({ where: { code } });
}

/** 取启用模板列表（订阅下拉用） */
export async function listTemplates() {
  return prisma.mailTemplate.findMany({
    where: { status: 1 },
    orderBy: [{ isSystem: 'desc' }, { id: 'asc' }],
    select: { id: true, code: true, name: true, subject: true, variables: true, isSystem: true, status: true },
  });
}

/** 首次部署时灌入系统模板（幂等，不覆盖管理员改过的内容） */
export async function ensureSystemTemplates() {
  let created = 0;
  for (const tpl of SYSTEM_TEMPLATES) {
    const exists = await prisma.mailTemplate.findUnique({ where: { code: tpl.code } });
    if (exists) continue;
    await prisma.mailTemplate.create({
      data: {
        code: tpl.code,
        name: tpl.name,
        subject: tpl.subject,
        bodyHtml: tpl.bodyHtml,
        variables: tpl.variables,
        isSystem: true,
        status: 1,
      },
    });
    created += 1;
  }
  return created;
}
