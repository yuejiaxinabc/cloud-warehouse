import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { resolveUploadPath, contentTypeFor } from '@/lib/upload-storage';

/**
 * GET /uploads/[...path] —— 上传图片的读取入口（M4）
 *
 * 之前没有任何处理器负责 /uploads/*，Next 只会在 public 目录存在对应文件时才回内容，
 * 而生产产物里 public 是构建期快照 → 运行期新写入的图片一律 404。
 *
 * 这里直接按白名单文件名读盘回流：不列目录、不做任何拼接推断、不执行任何解释。
 */

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const segments = params.path || [];
  // 只允许「单层文件名」，任何子目录形态直接 404
  if (segments.length !== 1) {
    return new Response('Not Found', { status: 404 });
  }

  const name = segments[0];
  const target = resolveUploadPath(name);
  if (!target) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const buf = await readFile(target);
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentTypeFor(name),
        'Content-Length': String(buf.byteLength),
        // 文件名带随机串，内容不会变，可长缓存
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
