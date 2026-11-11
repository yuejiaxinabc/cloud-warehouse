/**
 * 分页拉全量（R04 整改配套）
 *
 * 服务端现在严格校验 pageSize ≤ 200，任何超过上限的请求都返回 400。
 * 原来前端多处直接 pageSize=1000 拉商品/库存下拉选项，会整页报错；
 * 这里改成按 200 一页循环翻完，既遵守上限，又不丢选项。
 */
const MAX_PAGE_SIZE = 200;
const MAX_PAGES = 100;

export async function fetchAllPages<T = any>(
  url: string,
  pick: (payload: any) => T[] = (payload) => payload?.data?.items || payload?.data?.list || [],
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}page=${page}&pageSize=${MAX_PAGE_SIZE}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`加载失败（HTTP ${res.status}）`);
    const payload = await res.json();
    const items = pick(payload);
    if (!Array.isArray(items) || items.length === 0) break;
    out.push(...items);
    const total = Number(payload?.data?.total ?? 0);
    if (!Number.isFinite(total) || out.length >= total || items.length < MAX_PAGE_SIZE) break;
  }
  return out;
}
