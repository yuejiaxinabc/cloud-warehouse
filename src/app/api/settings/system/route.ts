import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/serialize";
import { requireAdmin } from '@/lib/auth-guard';

const CATEGORY = "system";

// 配置默认值（数据库无记录时返回）
const DEFAULTS: Record<string, any> = {
  companyName: "",
  contactPhone: "",
  contactEmail: "",
  lowStockAlertDays: 7,
  autoBackupEnabled: false,
  backupSchedule: "0 2 * * *",
  backupRetentionDays: 30,
};

// 读取 system 分类下的配置，缺失字段回退默认值
async function readSystemConfig(): Promise<Record<string, any>> {
  const rows = await prisma.systemConfig.findMany({ where: { category: CATEGORY } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.colKey] = r.value ?? "";

  return {
    companyName: (map.companyName ?? DEFAULTS.companyName).toString(),
    contactPhone: (map.contactPhone ?? DEFAULTS.contactPhone).toString(),
    contactEmail: (map.contactEmail ?? DEFAULTS.contactEmail).toString(),
    lowStockAlertDays: map.lowStockAlertDays
      ? Number(map.lowStockAlertDays)
      : DEFAULTS.lowStockAlertDays,
    autoBackupEnabled:
      map.autoBackupEnabled !== undefined
        ? map.autoBackupEnabled === "true"
        : DEFAULTS.autoBackupEnabled,
    backupSchedule: (map.backupSchedule ?? DEFAULTS.backupSchedule).toString(),
    backupRetentionDays: map.backupRetentionDays
      ? Number(map.backupRetentionDays)
      : DEFAULTS.backupRetentionDays,
  };
}

/** GET /api/settings/system - 获取系统信息（需登录） */
export async function GET() {
  try {
    // 公开接口，未登录也可读取（如登录页展示公司名称）
    const data = await readSystemConfig();
    return NextResponse.json(serializeBigInt({ success: true, data }));
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}

/** PUT /api/settings/system - upsert 系统信息（需登录） */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdmin();


    const body = await request.json();

    const companyName = String(body.companyName ?? DEFAULTS.companyName).slice(0, 200);
    const contactPhone = String(body.contactPhone ?? "").slice(0, 50);
    const contactEmail = String(body.contactEmail ?? "").slice(0, 200);
    const lowStockAlertDays = Number(body.lowStockAlertDays ?? DEFAULTS.lowStockAlertDays);
    const autoBackupEnabled = !!body.autoBackupEnabled;
    const backupSchedule = String(body.backupSchedule ?? DEFAULTS.backupSchedule).slice(0, 100);
    const backupRetentionDays = Number(body.backupRetentionDays ?? DEFAULTS.backupRetentionDays);

    const rows: Array<{ key: string; value: string }> = [
      { key: "companyName", value: companyName },
      { key: "contactPhone", value: contactPhone },
      { key: "contactEmail", value: contactEmail },
      { key: "lowStockAlertDays", value: String(lowStockAlertDays) },
      { key: "autoBackupEnabled", value: autoBackupEnabled ? "true" : "false" },
      { key: "backupSchedule", value: backupSchedule },
      { key: "backupRetentionDays", value: String(backupRetentionDays) },
    ];

    await Promise.all(
      rows.map(({ key, value }) =>
        prisma.systemConfig.upsert({
          where: { category_colKey: { category: CATEGORY, colKey: key } },
          create: { category: CATEGORY, colKey: key, value },
          update: { value },
        })
      )
    );

    return NextResponse.json(
      serializeBigInt({ success: true, message: "系统设置已保存" })
    );
  } catch (error: any) {
    return NextResponse.json(
      serializeBigInt({ success: false, error: error.message }),
      { status: 500 }
    );
  }
}
