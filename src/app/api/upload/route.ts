import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { writeFile, mkdir } from "fs/promises";
import crypto from "crypto";
import path from "path";

/**
 * 图片上传（FIX-2026-1012）
 *
 * 原实现的三处问题：
 *  1) 类型判断用的是客户端提供的 file.type（Content-Type），完全可伪造；
 *  2) 扩展名直接取 file.name 的后缀 —— 上传 evil.html + Content-Type: image/png，
 *     文件就落地成 public/uploads/xxx.html，被 Next 当 HTML 返回 → 存储型 XSS；
 *     而本站 JWT 存 localStorage，等于一次上传即可接管任意访问者账号；
 *  3) 文件名用 Math.random() 生成，可预测。
 *
 * 现在：按文件头魔数嗅探真实类型，扩展名只从白名单推导（不接受客户端输入），
 * 文件名用 crypto 随机，且显式拒绝 SVG（可内嵌脚本）。
 */

type Sniffed = { ext: string; mime: string };

function sniffImage(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: "png", mime: "image/png" };
  }
  // GIF: GIF87a / GIF89a
  const head6 = buf.subarray(0, 6).toString("ascii");
  if (head6 === "GIF87a" || head6 === "GIF89a") {
    return { ext: "gif", mime: "image/gif" };
  }
  // WEBP: RIFF....WEBP
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  // 明确拒绝 SVG / HTML / 其它：SVG 可内嵌 <script>
  return null;
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "缺少文件" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "文件不能超过5MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 以文件头为准，不看客户端 Content-Type
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
      return NextResponse.json(
        { success: false, error: "只支持 JPG / PNG / GIF / WEBP 图片" },
        { status: 400 }
      );
    }

    // 文件名：crypto 随机 + 服务端推导的扩展名，不采用任何用户输入
    const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.${sniffed.ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const target = path.join(uploadDir, name);
    // 兜底：确保解析结果仍在上传目录内（防符号链接/异常名跳出）
    if (!path.resolve(target).startsWith(path.resolve(uploadDir) + path.sep)) {
      return NextResponse.json({ success: false, error: "非法文件名" }, { status: 400 });
    }

    await writeFile(target, buffer);

    return NextResponse.json({ success: true, url: `/uploads/${name}` });
  } catch (error: any) {
    console.error("Upload error:", error);
    // 不回显 error.message，避免泄露服务端路径
    return NextResponse.json({ success: false, error: "上传失败" }, { status: 500 });
  }
}
