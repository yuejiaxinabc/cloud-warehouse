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

/**
 * 统一错误处理 - 将异常转为 API 响应
 * 安全：不向客户端暴露数据库/ORM 内部细节
 */
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
      'P2002': '数据已存在，请勿重复创建',
      'P2025': '记录不存在',
      'P2003': '关联数据不存在',
      'P2014': '数据关系冲突',
    };
    return Response.json(
      { success: false, code: Number(error.code), error: msgMap[error.code] || '数据库操作失败' },
      { status: error.code === 'P2002' ? 409 : 400 }
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return Response.json(
      { success: false, code: 400, error: '请求参数格式错误' },
      { status: 400 }
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
