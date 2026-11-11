"use client";

import React from "react";
import { Button } from "antd";
import { InboxOutlined } from "@ant-design/icons";

interface EmptyStateProps {
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * 空状态（1.2.4 分工 A）：大圆角容器内居中展示，不写死宽度。
 * 注意：加载中不要渲染它——DataTable 在 loading 时会先渲染骨架屏，
 * 只有加载完成且确实无数据时才展示空状态。
 */
export function EmptyState({ description = "暂无数据", actionText, onAction, className }: EmptyStateProps) {
  return (
    <div className={`yc-empty-state${className ? ` ${className}` : ""}`} role="status">
      <InboxOutlined style={{ fontSize: 56, color: "#CBD5E1", marginBottom: 12 }} />
      <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 4px" }}>{description}</p>
      {actionText && onAction && (
        <Button type="primary" onClick={onAction} style={{ marginTop: 12 }}>{actionText}</Button>
      )}
    </div>
  );
}

export default EmptyState;
