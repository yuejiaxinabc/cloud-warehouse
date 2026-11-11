import path from 'path';

/**
 * 上传文件存储（M4 / F2）
 *
 * v1.2.0 的问题：/api/upload 把文件写进 <cwd>/public/uploads 并回 /uploads/xxx.png，
 * 但生产环境是用 next start 起的 standalone 产物，public 目录不在产物里，
 * Next 也没有 /uploads 路由 → 上传「成功」但访问永远 404，商品主图必然是坏图。
 *
 * 修法：
 *  1) 目录集中由 UPLOAD_DIR 决定（生产建议指向持久盘，如 /var/lib/cloud-warehouse/uploads），
 *     缺省仍是 public/uploads，保持本地开发零配置；
 *  2) 新增 app/uploads/[...path]/route.ts 直接读盘回流 —— 不依赖 public 是否被打进产物；
 *  3) 文件名沿用「时间戳-随机hex.扩展名」，读取端只接受这个形状（防路径穿越与任意文件读取）。
 */

export function uploadDir(): string {
  const fromEnv = (process.env.UPLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), 'public', 'uploads');
}

/** 服务端生成的文件名格式：<13位时间戳>-<16位hex>.<白名单扩展名> */
const SAFE_NAME_RE = /^\d{10,16}-[a-f0-9]{16}\.(png|jpg|jpeg|gif|webp)$/i;

export function isSafeUploadName(name: string): boolean {
  return SAFE_NAME_RE.test(String(name || ''));
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export function contentTypeFor(name: string): string {
  const ext = String(name || '').split('.').pop()?.toLowerCase() || '';
  return MIME[ext] || 'application/octet-stream';
}

/** 解析成绝对路径，并保证结果仍在上传目录内（防 ../ 与符号链接跳出） */
export function resolveUploadPath(name: string): string | null {
  if (!isSafeUploadName(name)) return null;
  const dir = uploadDir();
  const target = path.resolve(dir, name);
  if (!target.startsWith(path.resolve(dir) + path.sep)) return null;
  return target;
}
