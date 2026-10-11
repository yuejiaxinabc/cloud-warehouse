"use client";

import React from "react";
import { Tag } from "antd";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, ALERT_LEVEL_COLORS } from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  labels?: Record<string, string>;
  colors?: Record<string, string>;
}

export function StatusBadge({ status, labels, colors }: StatusBadgeProps) {
  const label = labels?.[status] || status;
  const color = colors?.[status] || "default";
  return <Tag color={color}>{label}</Tag>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />;
}

export function AlertLevelBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = { info: "blue", warning: "orange", danger: "red" };
  const labelMap: Record<string, string> = { info: "提示", warning: "警告", danger: "严重" };
  return <Tag color={colorMap[level] || "default"}>{labelMap[level] || level}</Tag>;
}
