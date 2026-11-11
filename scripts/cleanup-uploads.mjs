#!/usr/bin/env node
/**
 * 清理上传目录孤儿文件（M4 配套）
 *
 * 背景：/api/upload 写入的文件名形如 <时间戳>-<随机hex>.<ext>，但没有任何删除接口，
 * 换图 / 删除商品后旧文件会一直留在磁盘上（报告里 9 个测试图都成了孤儿）。
 *
 * 用法：
 *   node scripts/cleanup-uploads.mjs            # 只报告，不删除
 *   node scripts/cleanup-uploads.mjs --apply    # 真删（默认只删 7 天前的）
 *   node scripts/cleanup-uploads.mjs --apply --days=3
 *
 * 判定「仍被引用」：products.image_url / attachments.file_url / system_configs 里出现该文件名。
 * 只按文件名匹配，避免路径拼接带来的误删。
 */
import { PrismaClient } from "@prisma/client";
import { readdir, stat, unlink } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const daysArg = args.find((a) => a.startsWith("--days="));
const days = daysArg ? Math.max(1, Number(daysArg.split("=")[1]) || 7) : 7;

function uploadDir() {
  const env = (process.env.UPLOAD_DIR || "").trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "public", "uploads");
}

const NAME_RE = /^\d{10,16}-[a-f0-9]{16}\.(png|jpg|jpeg|gif|webp)$/i;

async function referencedNames() {
  const names = new Set();

  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  for (const p of products) {
    const base = String(p.imageUrl || "").split("/").pop();
    if (base) names.add(base);
  }

  try {
    const atts = await prisma.attachment.findMany({ select: { url: true, fileName: true } });
    for (const a of atts) {
      const base = String(a.url || "").split("/").pop();
      if (base) names.add(base);
      if (a.fileName) names.add(String(a.fileName));
    }
  } catch {
    // 附件表在旧库可能不存在，忽略
  }

  return names;
}

async function main() {
  const dir = uploadDir();
  console.log("[cleanup-uploads] 目录:", dir, "| 模式:", apply ? "apply" : "dry-run", "| 保留天数:", days);

  let files = [];
  try {
    files = await readdir(dir);
  } catch (e) {
    console.log("[cleanup-uploads] 目录不存在，无需清理");
    return;
  }

  const keep = await referencedNames();
  const cutoff = Date.now() - days * 86400 * 1000;

  let removed = 0;
  let freed = 0;
  for (const name of files) {
    if (!NAME_RE.test(name)) continue;
    if (keep.has(name)) continue;

    const full = path.join(dir, name);
    const info = await stat(full).catch(() => null);
    if (!info || !info.isFile()) continue;
    if (info.mtimeMs > cutoff) continue;

    freed += info.size;
    if (apply) {
      await unlink(full).catch(() => null);
    }
    removed += 1;
  }

  console.log(`[cleanup-uploads] ${apply ? "已删除" : "可删除"} ${removed} 个孤儿文件，约 ${(freed / 1024 / 1024).toFixed(2)} MB`);
  if (!apply) console.log("[cleanup-uploads] 加 --apply 才会真正删除");
}

main()
  .catch((e) => {
    console.error("[cleanup-uploads] 失败:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
