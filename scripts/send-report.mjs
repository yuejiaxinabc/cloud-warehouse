#!/usr/bin/env node
/**
 * 库存报表邮件发送（v1.2.0）
 *
 * cron：每小时第 5 分钟跑一次，脚本自己判断「现在是不是订阅的时间点」：
 *   10 * * * * root cd /opt/cloud-warehouse && /opt/node/bin/node scripts/send-report.mjs >> /var/log/cloud-warehouse-report.log 2>&1
 *
 * 同一天已发过的不再重复发（lastSentAt 判断）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const nodemailer = require('nodemailer');
const prisma = new PrismaClient();

async function loadSmtp() {
  const rows = await prisma.systemConfig.findMany({ where: { category: 'smtp' } });
  const map = new Map(rows.map((r) => [r.colKey, r.value || '']));
  if (!map.get('host')) return null;
  return {
    host: map.get('host'),
    port: Number(map.get('port') || 465),
    secure: (map.get('secure') ?? 'true') === 'true',
    auth: map.get('user') ? { user: map.get('user'), pass: map.get('pass') || '' } : undefined,
    from: map.get('from') || map.get('user') || 'noreply@localhost',
    enabled: (map.get('enabled') ?? 'true') === 'true',
  };
}

function fmt(n) {
  return Number(n || 0).toLocaleString('zh-CN');
}

async function buildHtml() {
  const [inventories, products, alerts] = await Promise.all([
    prisma.inventory.findMany({ include: { product: { select: { name: true, code: true } } } }),
    prisma.product.count({ where: { status: 1, deletedAt: null } }),
    prisma.product.findMany({ where: { status: 1, deletedAt: null }, select: { id: true, name: true, safetyStock: true } }),
  ]);

  let totalQty = 0;
  let totalValue = 0;
  for (const inv of inventories) {
    totalQty += Number(inv.onHand || 0);
    totalValue += Number(inv.onHand || 0) * Number(inv.avgCost || 0);
  }

  const low = alerts.filter((p) => {
    const qty = inventories.filter((i) => i.productId === p.id).reduce((s, i) => s + Number(i.onHand || 0), 0);
    const safety = Number(p.safetyStock || 0);
    return safety > 0 && qty < safety;
  });

  const rows = low.slice(0, 20).map((p) => {
    const qty = inventories.filter((i) => i.productId === p.id).reduce((s, i) => s + Number(i.onHand || 0), 0);
    return `<tr><td style="padding:6px 10px;border-bottom:1px solid #EEF2F7">${p.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #EEF2F7;text-align:right">${fmt(qty)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #EEF2F7;text-align:right">${fmt(p.safetyStock)}</td></tr>`;
  }).join('');

  return `<div style="font-family:-apple-system,'PingFang SC',sans-serif;color:#0B1220">
    <h2 style="margin:0 0 4px">云仓 · 库存日报</h2>
    <p style="color:#5B6779;font-size:13px;margin:0 0 16px">${new Date().toLocaleString('zh-CN')}</p>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:18px">
      <tr><td style="padding:6px 14px 6px 0;color:#5B6779">商品种类</td><td><b>${products}</b></td></tr>
      <tr><td style="padding:6px 0;color:#5B6779">库存总量</td><td><b>${fmt(totalQty)}</b></td></tr>
      <tr><td style="padding:6px 0;color:#5B6779">库存总值</td><td><b>¥${fmt(Math.round(totalValue))}</b></td></tr>
      <tr><td style="padding:6px 0;color:#5B6779">低于安全库存</td><td><b style="color:#DC2626">${low.length}</b></td></tr>
    </table>
    ${low.length ? `<h3 style="font-size:15px;margin:0 0 8px">补货关注（前 20）</h3>
      <table style="border-collapse:collapse;font-size:13px;width:100%">
        <thead><tr style="background:#F8FAFC">
          <th style="text-align:left;padding:8px 10px">商品</th>
          <th style="text-align:right;padding:8px 10px">可用量</th>
          <th style="text-align:right;padding:8px 10px">安全库存</th>
        </tr></thead><tbody>${rows}</tbody>
      </table>` : '<p style="color:#16A34A">所有商品库存充足。</p>'}
    <p style="color:#93A0B4;font-size:12px;margin-top:20px">本邮件由云仓仓储管理系统自动发送</p>
  </div>`;
}

async function main() {
  const smtp = await loadSmtp();
  if (!smtp || !smtp.enabled) {
    console.log('[report] SMTP 未配置或已停用，跳过');
    return;
  }

  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay() === 0 ? 7 : now.getDay(); // 1=周一

  const subs = await prisma.reportSubscription.findMany({ where: { enabled: 1 } });
  const due = subs.filter((s) => {
    if (s.sendHour !== hour) return false;
    if (s.type === 'weekly') return s.weekday === dow;
    return true; // daily
  });
  if (!due.length) {
    console.log(`[report] ${hour} 点没有到期的订阅`);
    return;
  }

  const html = await buildHtml();
  const transport = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });

  for (const sub of due) {
    const last = sub.lastSentAt ? new Date(sub.lastSentAt) : null;
    const sameDay = last && last.toDateString() === now.toDateString();
    if (sameDay && sub.type === 'daily') {
      console.log(`[report] ${sub.name} 今天已发过，跳过`);
      continue;
    }
    try {
      const info = await transport.sendMail({
        from: smtp.from,
        to: sub.recipients,
        subject: `【云仓】库存${sub.type === 'weekly' ? '周报' : '日报'} ${now.toISOString().slice(0, 10)}`,
        html,
      });
      await prisma.reportSubscription.update({ where: { id: sub.id }, data: { lastSentAt: now } });
      console.log(`[report] ${sub.name} → ${sub.recipients} ok=${info.accepted?.join(',')}`);
    } catch (e) {
      console.error(`[report] ${sub.name} 发送失败:`, e.message);
    }
  }
  transport.close();
}

main()
  .catch((e) => { console.error('[report] failed:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
