import nodemailer from 'nodemailer';
import { prisma } from './prisma';

/**
 * SMTP 配置与发信（v1.2.0）
 *
 * 配置存在 system_configs（category = 'smtp'），管理员在「系统设置 → 邮件与订阅」里填。
 * 不在 .env 里写死，改配置不用重启；密码在接口层做脱敏返回。
 */
export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  enabled: boolean;
};

const KEYS = ['host', 'port', 'secure', 'user', 'pass', 'from', 'enabled'] as const;

export async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  const rows = await prisma.systemConfig.findMany({ where: { category: 'smtp' } });
  if (!rows.length) return null;
  const map = new Map(rows.map((r) => [r.colKey, r.value || '']));
  const host = map.get('host') || '';
  const user = map.get('user') || '';
  if (!host) return null;
  return {
    host,
    port: Number(map.get('port') || 465),
    secure: (map.get('secure') ?? 'true') === 'true',
    user,
    pass: map.get('pass') || '',
    from: map.get('from') || user || 'noreply@localhost',
    enabled: (map.get('enabled') ?? 'true') === 'true',
  };
}

export async function saveSmtpConfig(input: Partial<SmtpConfig>): Promise<void> {
  const entries: Array<[string, string]> = [];
  if (input.host !== undefined) entries.push(['host', String(input.host).trim()]);
  if (input.port !== undefined) entries.push(['port', String(Number(input.port) || 465)]);
  if (input.secure !== undefined) entries.push(['secure', input.secure ? 'true' : 'false']);
  if (input.user !== undefined) entries.push(['user', String(input.user).trim()]);
  // 密码为空表示「不修改」，避免前端把脱敏后的星号写回
  if (input.pass) entries.push(['pass', String(input.pass)]);
  // 只在非空时写入：空字符串表示「沿用发件账号」，不要覆盖已有显示名
  if (input.from !== undefined && String(input.from).trim()) {
    entries.push(['from', String(input.from).trim()]);
  }
  if (input.enabled !== undefined) entries.push(['enabled', input.enabled ? 'true' : 'false']);

  for (const [colKey, value] of entries) {
    await prisma.systemConfig.upsert({
      where: { category_colKey: { category: 'smtp', colKey } },
      create: { category: 'smtp', colKey, value },
      update: { value },
    });
  }
}

/** 从任意写法里抠出邮箱地址：支持 "名字 <a@b.com>"、"a@b.com"、纯名字（返回 null） */
export function extractEmail(input?: string | null): string | null {
  const s = String(input || '').trim();
  if (!s) return null;
  const m = s.match(/[^\s<>@,;:]+@[^\s<>@,;:]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}

/** 只取显示名："云仓仓储 <a@b.com>" → "云仓仓储"；"云仓仓储" → "云仓仓储"；"a@b.com" → "" */
export function extractDisplayName(input?: string | null): string {
  const s = String(input || '').trim();
  if (!s) return '';
  if (s.includes('<')) return s.replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
  return extractEmail(s) ? '' : s;
}

/**
 * 归一化发件人（FIX：Tencent Exmail 报 440 mail from account doesn't conform with authentication）
 *
 * 企业邮箱普遍要求「信封发件人 = 登录认证账号」。之前的实现直接把配置里的 from 字符串丢给
 * nodemailer：如果管理员只填了显示名（如「云仓仓储」），nodemailer 解析不出地址 →
 * MAIL FROM:<> → 服务商回 440。
 *
 * 现在的规则：
 *   - 地址一律取「发件账号」；没填账号才退回解析 from 里的地址
 *   - 显示名从 from 里解析，拼成 "名字 <账号>"
 *   - envelope.from 显式设为该地址，杜绝空信封
 */
export function resolveSender(cfg: SmtpConfig): { header: string; address: string; name: string } {
  const address = (cfg.user && extractEmail(cfg.user)) || extractEmail(cfg.from);
  if (!address) {
    throw new Error('发件人地址为空：请填写「发件账号」为完整邮箱（如 notify@yourdomain.com），或在「发件人显示」里写上邮箱地址');
  }
  const name = extractDisplayName(cfg.from);
  return {
    address,
    name,
    header: name ? `${name} <${address}>` : address,
  };
}

/** 把服务商返回的原始错误翻译成人能读懂的提示 */
export function humanizeSmtpError(raw: string): string {
  const msg = String(raw || '');
  if (/\b440\b|doesn't conform with authentication|does not conform/i.test(msg)) {
    return '发件人与登录账号不一致：企业邮箱要求 MAIL FROM 必须等于认证账号。请把「发件账号」填成本邮箱，「发件人显示」只写名字（不要写别的邮箱），保存后重试。';
  }
  if (/\b535\b|Authentication (failed|Failed)|Invalid login|LOGIN failed|AUTH/i.test(msg)) {
    return '认证失败：账号或授权码不正确（QQ/腾讯企业邮需要用「客户端专用密码/授权码」，不是网页登录密码）。';
  }
  if (/ETIMEDOUT|ECONNECTION|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)) {
    return '连不上 SMTP 服务器：检查服务器地址、端口与加密方式（465 用 SSL，587/25 用 STARTTLS），以及服务器出网是否被安全组拦截。';
  }
  return msg;
}

function buildTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

/** 连通性探测：登录 + 握手，不发信 */
export async function verifySmtp(cfg?: SmtpConfig | null) {
  const conf = cfg || (await loadSmtpConfig());
  if (!conf) throw new Error('还没有配置 SMTP');
  const transport = buildTransport(conf);
  await transport.verify();
  transport.close();
  return true;
}

export async function sendMail(options: { to: string | string[]; subject: string; html: string; text?: string }) {
  const conf = await loadSmtpConfig();
  if (!conf) throw new Error('还没有配置 SMTP');
  if (!conf.enabled) throw new Error('SMTP 已被停用');

  const sender = resolveSender(conf);
  const transport = buildTransport(conf);
  const to = Array.isArray(options.to) ? options.to.join(',') : options.to;
  const info = await transport.sendMail({
    from: sender.header,
    // 显式指定信封发件人，避免 from 只有显示名时 MAIL FROM 变成空
    envelope: { from: sender.address, to },
    to,
    subject: options.subject,
    html: options.html,
    text: options.text || undefined,
  });
  transport.close();
  return {
    messageId: info.messageId,
    from: sender.header,
    envelopeFrom: sender.address,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}
