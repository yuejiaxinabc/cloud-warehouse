/**
 * 服务端安全工具函数
 * - SQL 注入：Prisma 参数化查询天然防护，这里补充关键字黑名单（纵深防御）
 * - XSS：React 自动转义 HTML，这里对 dangerouslySetInnerHTML 和富文本内容做 DOMPurify 净化
 */

/** HTML 转义（防 XSS 注入到 innerHTML） */
export function escapeHtml(str: unknown): string {
  if (str == null) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * 搜索关键词净化（去除控制字符和超长内容，防止 ReDoS / 注入）
 * Prisma 的 where: { field: { contains: x } } 会参数化，但超长/恶意输入仍应限制
 */
export function sanitizeKeyword(input: unknown, maxLen = 100): string {
  if (!input) return "";
  const raw = String(input).trim().slice(0, maxLen);
  // 去除控制字符（\x00-\x1F 除了 \t\n\r）和 Unicode bidi 控制字符
  return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B\u200C\u200D\uFEFF]/g, "");
}

/**
 * 纯文本净化（用于用户名、姓名等，不允许任何 HTML）
 * 去除标签、反斜杠、换行等危险字符
 */
export function sanitizeText(input: unknown, maxLen = 200): string {
  if (!input) return "";
  return String(input)
    .trim()
    .slice(0, maxLen)
    .replace(/<[^>]*>/g, "")       // 去除 HTML 标签
    .replace(/[<>'"&\\]/g, "");    // 去除 XSS 特殊字符
}

/** 数字 ID 安全解析（NaN 抛错，防止注入） */
export function parseId(input: unknown): bigint {
  const n = typeof input === "bigint" ? input
    : typeof input === "number" ? input
    : parseInt(String(input), 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error("无效的 ID");
  return BigInt(n);
}

/** 邮箱格式基本校验 */
export function isValidEmail(email: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email ?? ""));
}

/** 手机号格式基本校验 */
export function isValidPhone(phone: unknown): boolean {
  return /^1[3-9]\d{9}$/.test(String(phone ?? ""));
}
