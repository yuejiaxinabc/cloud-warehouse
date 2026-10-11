"use client";

import React from "react";
import { Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  content: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLoading?: boolean;
}

export function ConfirmModal({ open, title, content, danger, onConfirm, onCancel, confirmLoading }: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      title={title}
      onOk={onConfirm}
      onCancel={onCancel}
      confirmLoading={confirmLoading}
      okText="确认"
      cancelText="取消"
      okButtonProps={{ danger }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <ExclamationCircleOutlined style={{ fontSize: 22, color: danger ? "#ff4d4f" : "#faad14", marginTop: 2 }} />
        <span>{content}</span>
      </div>
    </Modal>
  );
}
