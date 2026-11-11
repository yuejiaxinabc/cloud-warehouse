import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guard';
import { handleApiError } from '@/lib/errors';
import { BACKUP_DIR } from '@/lib/backup';

/** 下载备份文件（仅管理员）。用流式读取，避免把大文件整个读进内存 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const id = Number(new URL(req.url).searchParams.get('id') || 0);
    if (!id) return NextResponse.json({ success: false, error: '缺少备份 id' }, { status: 400 });

    const record = await prisma.backupRecord.findUnique({ where: { id: BigInt(id) } });
    if (!record) return NextResponse.json({ success: false, error: '备份不存在' }, { status: 404 });

    const filePath = path.join(BACKUP_DIR, record.fileName);
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: '备份文件已丢失' }, { status: 404 });

    const stream = fs.createReadStream(filePath);
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
      cancel() { stream.destroy(); },
    });

    return new NextResponse(webStream as any, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(record.fileName) + '"',
        'Content-Length': String((await fs.promises.stat(filePath)).size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
