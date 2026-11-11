"use client";

import React from "react";
import { Skeleton, Card } from "antd";

/**
 * 骨架屏（1.2.4 分工 A）：
 * 加载时一律用骨架屏，禁止先闪“暂无数据”或 0。
 * 全部用响应式网格，不写死固定宽度，手机上单列全宽。
 */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="yc-skeleton-table" role="status" aria-label="表格加载中">
      <Skeleton.Input active size="small" style={{ width: 160, maxWidth: "50%", height: 32, marginBottom: 16 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton.Input
              key={j}
              active
              size="small"
              style={{ flex: 1, minWidth: 0, height: 24 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="yc-kpi-grid yc-skeleton-grid" role="status" aria-label="卡片加载中">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} style={{ width: "100%", minWidth: 0 }}>
          <Skeleton active paragraph={{ rows: 2 }} />
        </Card>
      ))}
    </div>
  );
}

/** 页面级骨架：标题 + KPI 卡片 + 表格，先占位再出数据 */
export function PageSkeleton({ kpiCount = 4, tableRows = 5 }: { kpiCount?: number; tableRows?: number }) {
  return (
    <div role="status" aria-label="页面加载中" aria-busy="true">
      <Skeleton.Input active size="small" style={{ width: 180, maxWidth: "60%", height: 28, marginBottom: 16 }} />
      <CardSkeleton count={kpiCount} />
      <Card style={{ marginTop: 12 }}>
        <TableSkeleton rows={tableRows} />
      </Card>
    </div>
  );
}

export type LoadingSkeletonType = "card" | "table" | "page";

/**
 * 默认导出：与 src/components/ui/index.ts 的
 * `export { default as LoadingSkeleton }` 对应（此前文件没有默认导出，
 * 该 barrel 导出是坏的）。
 */
export default function LoadingSkeleton({
  type = "page",
  count,
  rows,
}: {
  type?: LoadingSkeletonType;
  count?: number;
  rows?: number;
}) {
  if (type === "card") return <CardSkeleton count={count ?? 4} />;
  if (type === "table") return <TableSkeleton rows={rows ?? 5} />;
  return <PageSkeleton kpiCount={count ?? 4} tableRows={rows ?? 5} />;
}
