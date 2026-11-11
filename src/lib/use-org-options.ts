'use client';

import { useEffect, useState } from 'react';

/**
 * v1.2.3：组织下拉数据源（角色数据范围 / 用户归属 / 仓库归属共用）
 * 只取 id 与 name，失败时返回空数组，不阻断页面。
 */
export interface OrgOption { label: string; value: number }

export function useOrgOptions(): OrgOption[] {
  const [options, setOptions] = useState<OrgOption[]>([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/organizations', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const list = (d && d.data && d.data.list) || [];
        setOptions(list.map((o: any) => ({ label: o.name, value: Number(o.id) })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return options;
}