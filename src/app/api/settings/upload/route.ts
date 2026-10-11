import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const CATEGORY = 'upload';

// 默认配置
const DEFAULTS = {
  provider: 'local',
  localPath: './public/uploads',
  bucket: '',
  region: '',
  accessKey: '',
  secretKey: '',
  endpoint: '',
  cdnDomain: '',
};

// 读取上传配置
async function getUploadConfig() {
  const rows = await prisma.systemConfig.findMany({ where: { category: CATEGORY } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.colKey] = r.value ?? '';
  
  return {
    provider: map.provider || DEFAULTS.provider,
    localPath: map.localPath || DEFAULTS.localPath,
    bucket: map.bucket || DEFAULTS.bucket,
    region: map.region || DEFAULTS.region,
    accessKey: map.accessKey ? '******' : '',
    secretKey: map.secretKey ? '******' : '',
    endpoint: map.endpoint || DEFAULTS.endpoint,
    cdnDomain: map.cdnDomain || DEFAULTS.cdnDomain,
  };
}

// 保存上传配置
async function saveUploadConfig(data: Record<string, string>) {
  const rows = Object.entries(data).map(([colKey, value]) => ({ colKey, value }));
  await Promise.all(
    rows.map(({ colKey, value }) =>
      prisma.systemConfig.upsert({
        where: { category_colKey: { category: CATEGORY, colKey } },
        create: { category: CATEGORY, colKey, value },
        update: { value },
      })
    )
  );
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const config = await getUploadConfig();
    return NextResponse.json({ success: true, data: config });
  } catch (e: any) {
    console.error('GET /api/settings/upload error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const roles = (session.user as any)?.roles || [];
    if (!roles.includes('admin')) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }

    const body = await req.json();
    const { provider, localPath, bucket, region, accessKey, secretKey, endpoint, cdnDomain } = body;

    const data: Record<string, string> = {};
    if (provider !== undefined) data.provider = String(provider);
    if (localPath !== undefined) data.localPath = String(localPath);
    if (bucket !== undefined) data.bucket = String(bucket);
    if (region !== undefined) data.region = String(region);
    if (accessKey && accessKey !== '******') data.accessKey = String(accessKey);
    if (secretKey && secretKey !== '******') data.secretKey = String(secretKey);
    if (endpoint !== undefined) data.endpoint = String(endpoint);
    if (cdnDomain !== undefined) data.cdnDomain = String(cdnDomain);

    await saveUploadConfig(data);
    return NextResponse.json({ success: true, message: '上传配置已保存' });
  } catch (e: any) {
    console.error('POST /api/settings/upload error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
