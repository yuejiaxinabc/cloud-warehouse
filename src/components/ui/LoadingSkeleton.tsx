"use client";

import React from "react";
import { Skeleton, Card, Space } from "antd";

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton.Input key={j} active size="small" style={{ width: 120, height: 24 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Space size="middle" wrap>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} style={{ width: 240 }}><Skeleton active paragraph={{ rows: 2 }} /></Card>
      ))}
    </Space>
  );
}
