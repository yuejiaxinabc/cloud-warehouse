/**
 * 统一错误处理
 */

/** 业务错误基类 */
export class AppError extends Error {
  public readonly code: number;
  public readonly statusCode: number;

  constructor(message: string, code: number = 400, statusCode?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode ?? (code);
  }
}

/** 资源不存在 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    const msg = id ? `${resource}（ID: ${id}）不存在` : `${resource}不存在`;
    super(msg, 404);
    this.name = 'NotFoundError';
  }
}

/** 权限不足 */
export class ForbiddenError extends AppError {
  constructor(message: string = '权限不足') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/** 未授权 */
export class UnauthorizedError extends AppError {
  constructor(message: string = '请先登录') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

/** 参数校验失败 */
export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>;

  constructor(errors: Record<string, string[]>, message: string = '参数校验失败') {
    super(message, 422);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/** 库存不足 */
export class InsufficientStockError extends AppError {
  public readonly productName: string;
  public readonly required: number;
  public readonly available: number;

  constructor(productName: string, required: number, available: number) {
    super(`商品"${productName}"库存不足，需要 ${required}，可用 ${available}`, 400);
    this.name = 'InsufficientStockError';
    this.productName = productName;
    this.required = required;
    this.available = available;
  }
}

/** 乐观锁冲突 */
export class ConflictError extends AppError {
  constructor(message: string = '数据已被其他人修改，请刷新后重试') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/** 状态不允许操作 */
export class InvalidStateError extends AppError {
  constructor(currentState: string, action: string) {
    super(`当前状态"${currentState}"不允许执行"${action}"操作`, 400);
    this.name = 'InvalidStateError';
  }
}

import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

/**
 * 统一错误处理 - 将异常转为 API 响应
 * 安全：不向客户端暴露数据库/ORM 内部细节
 */
/**
 * 安全错误文案（v1.2.1）
 *
 * 大量路由历史上直接 `error: error.message` 返回，把 Prisma 的表名/字段名/唯一约束名
 * 原样吐给前端（例如 `Unique constraint warehouses_code_key`、`Unknown field items`）。
 * 这里统一收口：业务错误照实返回，其余一律给通用文案，细节只留在服务器日志。
 */
export function safeErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof ZodError) return error.issues[0]?.message || '参数校验失败';
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return '数据已存在，请勿重复创建';
    if (error.code === 'P2025') return '记录不存在';
    if (error.code === 'P2021' || error.code === 'P2022') return '数据库结构未升级，请联系管理员';
    return fallback;
  }
  return fallback;
}

export function handleApiError(error: unknown): Response {
  // 完整错误打印到服务器日志
  console.error('[API Error]', error);

  // 自定义业务错误 → 直接返回消息
  if (error instanceof AppError) {
    return Response.json(
      {
        success: false,
        code: error.code,
        error: error.message,
        data: error instanceof ValidationError ? error.errors : null,
      },
      { status: error.statusCode }
    );
  }

  // Prisma 已知错误 → 返回通用消息（不暴露表名/字段名）
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const msgMap: Record<string, string> = {
      'P2000': '字段内容超出长度限制',
      'P2002': '数据已存在，请勿重复创建',
      'P2003': '关联数据不存在',
      'P2010': '数据库查询执行失败',
      'P2011': '必填字段不能为空',
      'P2014': '数据关系冲突',
      'P2021': '数据表尚未初始化，请联系管理员执行数据库升级',
      'P2022': '数据库结构未升级，请联系管理员执行数据库升级',
      'P2025': '记录不存在',
      'P2028': '数据库事务超时，请减少单次操作的数据量后重试',
      'P2034': '写入冲突，请重试',
    };
    // v1.2.1：状态码按错误语义返回，不再一律 400（P2002 冲突 409、P2025 不存在 404、
    // P2021/P2022 表/字段缺失 503），避免前端把「表没建」当成用户输入错误。
    const status = error.code === 'P2002' || error.code === 'P2034'
      ? 409
      : error.code === 'P2025'
        ? 404
        : error.code === 'P2021' || error.code === 'P2022'
          ? 503
          : 400;
    return Response.json(
      { success: false, code: status, error: msgMap[error.code] || '数据库操作失败' },
      { status }
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return Response.json(
      { success: false, code: 400, error: '请求参数格式错误' },
      { status: 400 }
    );
  }

  // v1.2.1：Zod 校验失败必须回 422。此前没有这个分支，所有字段校验错误都被兜底成
  // 「服务器内部错误」，前端只能显示无关文案，测试里 6 处 500 都由此而来。
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.length ? issue.path.join('.') : '_';
      (fieldErrors[key] ||= []).push(issue.message);
    }
    return Response.json(
      {
        success: false,
        code: 422,
        error: error.issues[0]?.message || '参数校验失败',
        data: fieldErrors,
      },
      { status: 422 }
    );
  }

  // v1.2.1：非法 JSON / 空请求体（request.json() 抛 SyntaxError）不再 500
  if (error instanceof SyntaxError) {
    return Response.json(
      { success: false, code: 400, error: '请求体不是合法的 JSON' },
      { status: 400 }
    );
  }

  // v1.2.1：数据库不可用/未初始化要与业务错误区分，避免把运维问题伪装成 500 业务故障
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return Response.json(
      { success: false, code: 503, error: '数据库暂不可用，请稍后重试' },
      { status: 503 }
    );
  }

  // 其他错误 → 不暴露 error.message（可能包含 SQL/Prisma 内部信息）
  return Response.json(
    { success: false, code: 500, error: '服务器内部错误，请稍后重试' },
    { status: 500 }
  );
}

/**
 * 统一 API 响应格式
 */
export function successResponse<T>(data: T, message?: string) {
  return Response.json({
    success: true,
    code: 0,
    message: message || 'success',
    data: JSON.parse(JSON.stringify(data, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )),
  });
}

export function errorResponse(message: string, code: number = 400) {
  return Response.json(
    { success: false, code, error: message },
    { status: code }
  );
}

/**
 * 解析分页参数
 */
export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
