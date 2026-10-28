import crypto from 'crypto';

/**
 * 验证码存储（服务端一次性票据）
 *
 * FIX-2026-1012：原实现把存储写在 /api/auth/captcha/route.ts 里，导致
 * NextAuth 的 authorize() 根本访问不到，登录流程只是「前端先验一次就算数」——
 * 攻击者跳过前端直接 POST /api/auth/callback/credentials 即可完全绕过验证码。
 * 现在抽成独立模块，由 route 与 authorize() 共用，验证码才真正生效。
 */

type Entry = { text: string; expiresAt: number };

const EXPIRE_MS = 5 * 60 * 1000;

const globalForCaptcha = globalThis as unknown as {
  __captchaStore?: Map<string, Entry>;
};
const store = (globalForCaptcha.__captchaStore ??= new Map<string, Entry>());

function sweep() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}

export function issueCaptcha(len = 4): { token: string; text: string } {
  // 只保留大写字母与数字（去掉 I/L/O/0/1 等易混字符）。
  // 点阵字模按 5x7 设计，小写无法清晰渲染，因此不再混用小写。
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let text = '';
  for (let i = 0; i < len; i++) text += CHARS[bytes[i] % CHARS.length];

  const token = crypto.randomBytes(24).toString('base64url');

  sweep();
  store.set(token, { text, expiresAt: Date.now() + EXPIRE_MS });
  return { token, text };
}

/**
 * 只校验、不消费（v1.1.1）。
 *
 * 登录页在提交前先调这里，用它可以给出「验证码错误 / 已过期」的精确提示，
 * 而不会泄露账号是否存在。真正的消费仍在 authorize() 里做，绕过前端依旧无意义。
 */
export function checkCaptcha(token: string, answer: string): { ok: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: '验证码参数错误，请点击图片刷新' };
  }
  const entry = store.get(token);
  if (!entry) return { ok: false, error: '验证码已过期，请点击图片刷新' };
  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return { ok: false, error: '验证码已过期，请点击图片刷新' };
  }

  const input = String(answer ?? '').trim();
  if (!input) return { ok: false, error: '请输入验证码' };
  if (entry.text.toLowerCase() !== input.toLowerCase()) {
    return { ok: false, error: '验证码错误，请重新输入' };
  }
  return { ok: true };
}

/**
 * 一次性消费验证码。无论成功失败都会销毁票据，防止重放与爆破。
 */
export function consumeCaptcha(token: string, answer: string): { ok: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { ok: false, error: '验证码参数错误' };
  }
  const entry = store.get(token);
  if (!entry) return { ok: false, error: '验证码已过期，请刷新' };

  // 一次性：取出即删
  store.delete(token);

  if (Date.now() > entry.expiresAt) return { ok: false, error: '验证码已过期，请刷新' };

  const input = String(answer ?? '').trim().toLowerCase();
  if (!input) return { ok: false, error: '请输入验证码' };
  if (entry.text.toLowerCase() !== input) return { ok: false, error: '验证码错误' };

  return { ok: true };
}
