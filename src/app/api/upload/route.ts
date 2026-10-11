import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ success: false, error: "缺少文件" }, { status: 400 });
    }

    // 限制 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "文件不能超过5MB" }, { status: 400 });
    }

    // 只允许图片
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "只支持图片文件" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 生成唯一文件名
    const ext = file.name.split(".").pop() || "jpg";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");

    // 确保目录存在
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, name), buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${name}`,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
