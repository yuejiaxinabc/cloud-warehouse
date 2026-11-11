import { AppError } from './errors';

export const MAX_PAGE_SIZE = 200;
// Prisma skip is a signed 32-bit integer. Bound both the page and its offset.
export const MAX_PAGINATION_OFFSET = 2_147_483_647;

/** Missing parameters use defaults; explicitly supplied malformed values are errors. */
export function parsePagination(searchParams: URLSearchParams) {
  function positiveInteger(name: string, fallback: number, max: number): number {
    const values = searchParams.getAll(name);
    if (!values.length) return fallback;
    const raw = values[0];
    const value = Number(raw);
    if (values.length !== 1 || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) {
      throw new AppError(`${name} 必须是 1 到 ${max} 之间的整数`, 400);
    }
    return value;
  }
  const page = positiveInteger('page', 1, MAX_PAGINATION_OFFSET);
  const pageSize = positiveInteger('pageSize', 20, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  if (!Number.isSafeInteger(skip) || skip > MAX_PAGINATION_OFFSET) {
    throw new AppError('分页偏移量超出允许范围', 400);
  }
  return { page, pageSize, skip };
}
