/**
 * 运行时密钥体检
 *
 * FIX-2026-1012（P0）：
 * 仓库里曾以 "..env.vNsxxG4DI5" 为名提交过生产 .env —— .gitignore 只写了 ".env"，
 * 换个文件名就漏了。该文件已进入 https://github.com/yuejiaxinabc/cloud-warehouse
 * 公开历史，其中的 NEXTAUTH_SECRET 与数据库口令等同公开。
 *
 * 任何人拿到 NEXTAUTH_SECRET 就能离线签发合法 JWT，直接以任意 userId 登录，
 * 不需要账号密码、不需要验证码、也不会留下登录失败记录。
 * 因此这里做两件事：
 *   1) 启动期（instrumentation）直接拒绝启动；
 *   2) 每次登录前再校验一次，不合格只对内记录，对外统一文案。
 */

const WEAK_PATTERNS = [
  'inventory-system-secret-key-2026-very-long-string',
  'secret',
  'changeme',
  'change-me',
  'your-secret',
  'please-change',
  'development',
  'example',
  'password',
];

export type SecretCheck = { ok: boolean; reason?: string };

export function checkNextAuthSecret(secret: string | undefined): SecretCheck {
  if (!secret) return { ok: false, reason: '未设置 NEXTAUTH_SECRET' };
  if (secret.length < 32) return { ok: false, reason: 'NEXTAUTH_SECRET 少于 32 字符' };

  const lower = secret.toLowerCase();
  for (const p of WEAK_PATTERNS) {
    if (lower.includes(p)) return { ok: false, reason: 'NEXTAUTH_SECRET 含弱口令特征：' + p };
  }

  const distinct = new Set(secret).size;
  if (distinct < 16) return { ok: false, reason: 'NEXTAUTH_SECRET 字符种类过少，疑似人工构造' };

  if (/^(.)\1{31,}$/.test(secret)) return { ok: false, reason: 'NEXTAUTH_SECRET 为重复字符' };

  return { ok: true };
}

function buildMessage(reason: string): string {
  return (
    '[安全] NEXTAUTH_SECRET 不合格：' + reason +
    '\n  生成：openssl rand -base64 48' +
    '\n  这份密钥一旦泄露，攻击者可伪造任意用户会话（含管理员）。'
  );
}

/**
 * 启动期自检 —— 由 instrumentation.ts 调用。不合格时生产环境直接抛错，
 * 让进程起不来；开发环境只告警，避免本地没法调试。
 */
export function assertSecretOrThrow(): void {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const res = checkNextAuthSecret(process.env.NEXTAUTH_SECRET);
  if (res.ok) return;

  const msg = buildMessage(res.reason || '未知原因');
  if (process.env.NODE_ENV === 'production') {
    console.error(msg);
    throw new Error(msg);
  }
  console.warn(msg);
}

/**
 * 登录前复核（纵深防御：万一绕过 instrumentation 或改了启动方式）。
 * 返回 false 时调用方应拒绝登录，但对外只能给通用文案。
 */
export function secretUsable(): boolean {
  const res = checkNextAuthSecret(process.env.NEXTAUTH_SECRET);
  if (res.ok) return true;
  console.error(buildMessage(res.reason || '未知原因'));
  return false;
}
