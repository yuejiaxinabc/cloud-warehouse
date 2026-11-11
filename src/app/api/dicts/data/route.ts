import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAdmin, requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';
import { handleApiError } from '@/lib/errors';

/**
 * 字典项（v1.2.3）
 *
 * GET 必须对所有已登录用户开放：入库/出库/盘点/调拨等业务页面的下拉框都靠它取值。
 * 写操作仅管理员。
 */

/** 校验并转换主键：非法值返回 null，由调用方给 400，避免 BigInt() 抛错被打成 500 */
function toId(value: unknown): bigint | null {
  try {
    if (value === null || value === undefined || value === '') return null;
    return BigInt(String(value));
  } catch {
    return null;
  }
}

/** 把前端传来的启用状态收敛成 1/0 */
function normalizeStatus(value: unknown, fallback = 1): number {
  if (value === undefined || value === null || value === '') return fallback;
  return Number(value) === 0 ? 0 : 1;
}

/**
 * GET /api/dicts/data?typeCode=xx[&all=1] - 取某类型的字典项（sort 升序）
 * 默认只返回 status=1 的启用项，供业务下拉使用；all=1 时返回全部（字典管理页编辑用）。
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const typeCode = (searchParams.get('typeCode') || '').trim();
    const all = searchParams.get('all') === '1';

    if (!typeCode) {
      return NextResponse.json({ success: false, error: '缺少字典类型编码 typeCode' }, { status: 400 });
    }

    const where: any = { typeCode };
    if (!all) where.status = 1;

    const list = await prisma.dictData.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      data: list.map((item) => ({
        id: Number(item.id),
        typeCode: item.typeCode,
        label: item.label,
        value: item.value,
        sort: item.sort,
        status: item.status,
        isDefault: item.isDefault,
        remark: item.remark,
      })),
    }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/dicts/data - 新增字典项
 * body: { typeCode, label, value, sort?, status?, isDefault?, remark? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const userId = (session.user as any)?.id;

    const body = await req.json();
    const { typeCode, label, value, sort, status, isDefault, remark } = body || {};

    const dictCode = String(typeCode || '').trim();
    const itemLabel = String(label || '').trim();
    const itemValue = String(value || '').trim();

    if (!dictCode || !itemLabel || !itemValue) {
      return NextResponse.json({ success: false, error: '字典类型、显示文本和存储值必填' }, { status: 400 });
    }

    const type = await prisma.dictType.findUnique({ where: { code: dictCode } });
    if (!type) {
      return NextResponse.json({ success: false, error: `字典类型「${dictCode}」不存在` }, { status: 400 });
    }

    const dup = await prisma.dictData.findUnique({
      where: { typeCode_value: { typeCode: dictCode, value: itemValue } },
    });
    if (dup) {
      return NextResponse.json(
        { success: false, error: `该字典下存储值「${itemValue}」已存在` },
        { status: 400 }
      );
    }

    const created = await prisma.dictData.create({
      data: {
        typeCode: dictCode,
        label: itemLabel,
        value: itemValue,
        sort: sort === undefined || sort === null || sort === '' ? 0 : Number(sort),
        status: normalizeStatus(status, 1),
        isDefault: Boolean(isDefault),
        remark: remark ? String(remark) : null,
      },
    });

    await writeLog({
      module: 'system',
      action: 'create',
      userId,
      ip: getClientIp(),
      content: `新增字典项 ${type.name}（${dictCode}）：${itemLabel} = ${itemValue}`,
      refType: 'dict',
      refId: created.id,
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      message: '字典项新增成功',
      data: {
        id: Number(created.id),
        typeCode: created.typeCode,
        label: created.label,
        value: created.value,
        sort: created.sort,
        status: created.status,
        isDefault: created.isDefault,
        remark: created.remark,
      },
    }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/dicts/data - 更新字典项
 * body: { id, label, value?, sort?, status?, isDefault?, remark? }
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const userId = (session.user as any)?.id;

    const body = await req.json();
    const { id, label, value, sort, status, isDefault, remark } = body || {};
    const itemId = toId(id);
    if (!itemId) {
      return NextResponse.json({ success: false, error: '缺少字典项 ID 或 ID 不合法' }, { status: 400 });
    }

    const current = await prisma.dictData.findUnique({ where: { id: itemId } });
    if (!current) {
      return NextResponse.json({ success: false, error: '字典项不存在' }, { status: 404 });
    }

    const itemLabel = String(label || '').trim();
    if (!itemLabel) {
      return NextResponse.json({ success: false, error: '显示文本必填' }, { status: 400 });
    }

    const itemValue = value === undefined || value === null || value === ''
      ? current.value
      : String(value).trim();

    if (itemValue !== current.value) {
      const dup = await prisma.dictData.findUnique({
        where: { typeCode_value: { typeCode: current.typeCode, value: itemValue } },
      });
      if (dup) {
        return NextResponse.json(
          { success: false, error: `该字典下存储值「${itemValue}」已存在` },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.dictData.update({
      where: { id: itemId },
      data: {
        label: itemLabel,
        value: itemValue,
        sort: sort === undefined || sort === null || sort === '' ? current.sort : Number(sort),
        status: normalizeStatus(status, current.status),
        isDefault: isDefault === undefined ? current.isDefault : Boolean(isDefault),
        remark: remark !== undefined ? (remark ? String(remark) : null) : current.remark,
      },
    });

    await writeLog({
      module: 'system',
      action: 'update',
      userId,
      ip: getClientIp(),
      content: `修改字典项 ${updated.typeCode}：${updated.label} = ${updated.value}`,
      refType: 'dict',
      refId: updated.id,
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      message: '字典项更新成功',
      data: {
        id: Number(updated.id),
        typeCode: updated.typeCode,
        label: updated.label,
        value: updated.value,
        sort: updated.sort,
        status: updated.status,
        isDefault: updated.isDefault,
        remark: updated.remark,
      },
    }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/dicts/data?id= - 删除字典项
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const userId = (session.user as any)?.id;

    const { searchParams } = new URL(req.url);
    const itemId = toId(searchParams.get('id'));
    if (!itemId) {
      return NextResponse.json({ success: false, error: '缺少字典项 ID 或 ID 不合法' }, { status: 400 });
    }

    const current = await prisma.dictData.findUnique({ where: { id: itemId } });
    if (!current) {
      return NextResponse.json({ success: false, error: '字典项不存在' }, { status: 404 });
    }

    await prisma.dictData.delete({ where: { id: itemId } });

    await writeLog({
      module: 'system',
      action: 'delete',
      userId,
      ip: getClientIp(),
      content: `删除字典项 ${current.typeCode}：${current.label} = ${current.value}`,
      refType: 'dict',
      refId: current.id,
    });

    return NextResponse.json({ success: true, message: '字典项已删除' });
  } catch (error) {
    return handleApiError(error);
  }
}