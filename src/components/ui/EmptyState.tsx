"use client";

import React from "react";
import { Empty, Button } from "antd";
import { InboxOutlined } from "@ant-design/icons";

interface EmptyStateProps {
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export function EmptyState({ description = "暂无数据", actionText, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <InboxOutlined style={{ fontSize: 64, color: "#d9d9d9", marginBottom: 16 }} />
      <p style={{ color: "#999", marginBottom: actionText ? 16 : 0 }}>{description}</p>
      {actionText && onAction && (
        <Button type="primary" onClick={onAction}>{actionText}</Button>
      )}
    </div>
  );
}
