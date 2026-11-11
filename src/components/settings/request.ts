/** Require both HTTP and application success; never display raw server exceptions. */
export async function settingsRequest(url: string, options?: RequestInit) {
  let res: Response;
  try { res = await fetch(url, { ...options, credentials: 'include', cache: 'no-store' }); }
  catch { throw new Error('网络连接失败，请检查网络后重试'); }
  let data: any;
  try { data = await res.json(); } catch { throw new Error('接口返回格式异常（HTTP ' + res.status + '）'); }
  if (!res.ok || data?.success !== true) {
    if (res.status === 401) throw new Error('登录已过期，请重新登录');
    if (res.status === 403) throw new Error('权限不足，请联系管理员');
    if (res.status === 429) throw new Error('操作过于频繁，请稍后再试');
    throw new Error('操作未完成（HTTP ' + res.status + '），请检查输入或联系管理员');
  }
  return data;
}

/** Load every page so existing role assignments are never silently dropped. */
export async function settingsList(url: string): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 1; page <= 1000; page++) {
    const d = await settingsRequest(url + '?page=' + page + '&pageSize=100');
    const list = d.data?.list || d.data?.items || (Array.isArray(d.data) ? d.data : null);
    if (!Array.isArray(list)) throw new Error('列表返回格式异常，请重试');
    rows.push(...list);
    if (typeof d.data?.total !== 'number' || rows.length >= d.data.total) return rows;
    if (!list.length) throw new Error('列表分页不完整，请重试');
  }
  throw new Error('列表过大，请联系管理员');
}
