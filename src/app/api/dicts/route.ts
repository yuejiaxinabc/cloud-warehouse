import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeBigInt } from '@/lib/serialize';
import { requireAdmin, requireAuth } from '@/lib/auth-guard';
import { writeLog, getClientIp } from '@/lib/log';
import { handleApiError } from '@/lib/errors';

/**
 * 字典中心（v1.2.3）
 *
 * 字典类型 = dict_types，字典项 = dict_data（typeCode 外键指向 DictType.code）。
 * 鉴权：读取对所有已登录用户开放（业务页面/下拉框要用），写操作仅管理员。
 */

/** 统一的字典编码校验：字母开头，只允许字母数字下划线 */
const CODE_REG = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

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
 * GET /api/dicts - 字典类型分页列表
 * query: page、pageSize、keyword（匹配 code / name）
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const rawPageSize = parseInt(searchParams.get('pageSize') || '20', 10) || 20;
    const pageSize = Math.min(200, Math.max(1, rawPageSize));
    const keyword = (searchParams.get('keyword') || '').trim();

    const where: any = {};
    if (keyword) {
      where.OR = [{ code: { contains: keyword } }, { name: { contains: keyword } }];
    }

    const [rows, total] = await Promise.all([
      prisma.dictType.findMany({
        where,
        // 系统内置字典排在最前，其余按创建顺序
        orderBy: [{ isSystem: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { items: true } } },
      }),
      prisma.dictType.count({ where }),
    ]);

    return NextResponse.json(serializeBigInt({
      success: true,
      data: {
        list: rows.map((row) => ({
          id: Number(row.id),
          code: row.code,
          name: row.name,
          status: row.status,
          remark: row.remark,
          isSystem: row.isSystem,
          itemCount: row._count.items,
        })),
        total,
        page,
        pageSize,
      },
    }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/dicts - 新建字典类型
 * body: { code, name, status?, remark? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const userId = (session.user as any)?.id;
    const body = await req.json();
    const { code, name, status, remark } = body || {};

    const dictCode = String(code || '').trim();
    const dictName = String(name || '').trim();

    if (!dictCode || !dictName) {
      return NextResponse.json({ success: false, error: '字典编码和字典名称必填' }, { status: 400 });
    }
    if (!CODE_REG.test(dictCode)) {
      return NextResponse.json(
        { success: false, error: '字典编码格式不正确：字母开头，只能包含字母、数字和下划线，最长 64 位' },
        { status: 400 }
      );
    }

    const existing = await prisma.dictType.findUnique({ where: { code: dictCode } });
    if (existing) {
      return NextResponse.json({ success: false, error: `字典编码「${dictCode}」已存在，请换一个编码` }, { status: 400 });
    }

    const created = await prisma.dictType.create({
      data: {
        code: dictCode,
        name: dictName,
        status: normalizeStatus(status, 1),
        remark: remark ? String(remark) : null,
        isSystem: false,
      },
    });

    await writeLog({
      module: 'system',
      action: 'create',
      userId,
      ip: getClientIp(),
      content: `新建字典类型 ${dictName}（${dictCode}）`,
      refType: 'dict',
      refId: created.id,
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      message: '字典类型创建成功',
      data: {
        id: Number(created.id),
        code: created.code,
        name: created.name,
        status: created.status,
        remark: created.remark,
        isSystem: created.isSystem,
        itemCount: 0,
      },
    }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PUT /api/dicts - 更新字典类型
 * body: { id, name, status?, remark? }（编码不可改，避免已落库的业务值失效）
 */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const userId = (session.user as any)?.id;

    const body = await req.json();
    const { id, name, status, remark } = body || {};
    const dictId = toId(id);
    if (!dictId) {
      return NextResponse.json({ success: false, error: '缺少字典类型 ID 或 ID 不合法' }, { status: 400 });
    }

    const current = await prisma.dictType.findUnique({ where: { id: dictId } });
    if (!current) {
      return NextResponse.json({ success: false, error: '字典类型不存在' }, { status: 404 });
    }

    const dictName = String(name || '').trim();
    if (!dictName) {
      return NextResponse.json({ success: false, error: '字典名称必填' }, { status: 400 });
    }

    const updated = await prisma.dictType.update({
      where: { id: dictId },
      data: {
        name: dictName,
        status: normalizeStatus(status, current.status),
        remark: remark !== undefined ? (remark ? String(remark) : null) : current.remark,
      },
    });

    await writeLog({
      module: 'system',
      action: 'update',
      userId,
      ip: getClientIp(),
      content: `修改字典类型 ${updated.name}（${updated.code}）`,
      refType: 'dict',
      refId: updated.id,
    });

    return NextResponse.json(serializeBigInt({
      success: true,
      message: '字典类型更新成功',
      data: {
        id: Number(updated.id),
        code: updated.code,
        name: updated.name,
        status: updated.status,
        remark: updated.remark,
        isSystem: updated.isSystem,
      },
    }));
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/dicts?id= - 删除字典类型
 * 系统内置（isSystem=true）不允许删除；存在字典项时级联删除并在提示里说明条数。
 */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const userId = (session.user as any)?.id;

    const { searchParams } = new URL(req.url);
    const dictId = toId(searchParams.get('id'));
    if (!dictId) {
      return NextResponse.json({ success: false, error: '缺少字典类型 ID 或 ID 不合法' }, { status: 400 });
    }

    const current = await prisma.dictType.findUnique({ where: { id: dictId } });
    if (!current) {
      return NextResponse.json({ success: false, error: '字典类型不存在' }, { status: 404 });
    }
    if (current.isSystem) {
      return NextResponse.json(
        { success: false, error: `「${current.name}」是系统内置字典，不允许删除` },
        { status: 400 }
      );
    }

    // 外键 onDelete: Cascade 已配置，这里显式先清字典项，便于把清理条数带回前端
    const removedItems = await prisma.dictData.count({ where: { typeCode: current.code } });
    if (removedItems > 0) {
      await prisma.dictData.deleteMany({ where: { typeCode: current.code } });
    }
    await prisma.dictType.delete({ where: { id: dictId } });

    await writeLog({
      module: 'system',
      action: 'delete',
      userId,
      ip: getClientIp(),
      content: `删除字典类型 ${current.name}（${current.code}），同时清理 ${removedItems} 个字典项`,
      refType: 'dict',
      refId: current.id,
    });

    return NextResponse.json({
      success: true,
      message: removedItems > 0
        ? `字典类型已删除，同时清理了 ${removedItems} 个字典项`
        : '字典类型已删除',
      data: { removedItems },
    });
  } catch (error) {
    return handleApiError(error);
  }
}