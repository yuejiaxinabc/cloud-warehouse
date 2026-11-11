"use client";

import React from "react";
import { Tag } from "antd";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  labels?: Record<string, string>;
  colors?: Record<string, string>;
}

/**
 * L4 修复：状态枚举统一中文映射。
 * src/lib/constants 的映射表缺 SUBMITTED / SHIPPED / COMPLETED / PARTIAL 等状态码，
 * 这里按统一口径补齐（同名 key 以本表为准），所有列表页/详情页都走 StatusBadge，
 * 不再出现 draft / POSTED / ADJUSTED 这类英文枚举直出。
 */
const STATUS_LABELS_EXTRA: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待审批",
  PENDING: "待处理",
  APPROVED: "已审批",
  LOCKED: "已锁定",
  POSTED: "已过账",
  SHIPPED: "已发出",
  SENT: "已发出",
  RECEIVED: "已接收",
  COUNTING: "盘点中",
  IN_PROGRESS: "进行中",
  ADJUSTED: "已调整",
  COMPLETED: "已完成",
  PARTIAL: "部分",
  CLOSED: "已关闭",
  CANCELLED: "已取消",
  REJECTED: "已驳回",
};

/** 状态码 -> 中文文案（全局唯一出口） */
export const STATUS_LABELS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  ...STATUS_LABELS_EXTRA,
  // 后端部分接口回小写枚举，同样走中文（否则会出现 draft / posted 直出）
  submitted: "待审批",
  completed: "已完成",
  adjusted: "已调整",
  cancelled: "已取消",
  partial: "部分",
  shipped: "已发出",
  locked: "已锁定",
  counting: "盘点中",
  closed: "已关闭",
  rejected: "已驳回",
};

/** 状态码 -> 颜色（与文案表一一对应） */
export const STATUS_COLORS: Record<string, string> = {
  ...ORDER_STATUS_COLORS,
  SUBMITTED: "orange",
  SHIPPED: "cyan",
  IN_PROGRESS: "processing",
  COMPLETED: "green",
  PARTIAL: "gold",
  REJECTED: "red",
  submitted: "orange",
  completed: "green",
  adjusted: "warning",
  cancelled: "red",
  partial: "gold",
  shipped: "cyan",
  locked: "purple",
  counting: "processing",
  closed: "default",
  rejected: "red",
};

export function StatusBadge({ status, labels, colors }: StatusBadgeProps) {
  // 调用方显式传的 labels/colors 优先（个别单据有自己的流转文案），其余回落到统一映射
  const label = labels?.[status] ?? STATUS_LABELS[status] ?? status;
  const color = colors?.[status] ?? STATUS_COLORS[status] ?? "default";
  return <Tag color={color}>{label}</Tag>;
}

export function OrderStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} labels={STATUS_LABELS} colors={STATUS_COLORS} />;
}

// src/components/ui/index.ts 用 default 方式再导出，这里补一个默认导出（与具名导出并存）
export default StatusBadge;

export function AlertLevelBadge({ level }: { level: string }) {
  // 预警中心后端回的是 CRITICAL/WARNING/INFO（大写），兼容旧的 info/warning/danger
  const colorMap: Record<string, string> = {
    info: "blue", warning: "orange", danger: "red",
    INFO: "blue", WARNING: "orange", CRITICAL: "red", DANGER: "red",
  };
  const labelMap: Record<string, string> = {
    info: "提示", warning: "警告", danger: "严重",
    INFO: "提示", WARNING: "警告", CRITICAL: "严重", DANGER: "严重",
  };
  return <Tag color={colorMap[level] || "default"}>{labelMap[level] || level}</Tag>;
}
