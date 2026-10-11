"use client";

import React, { useState } from "react";
import { Modal, Input, message } from "antd";
import { ScanOutlined } from "@ant-design/icons";

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function ScanModal({ open, onClose, onScan }: ScanModalProps) {
  const [code, setCode] = useState("");

  const handleOk = () => {
    if (!code.trim()) {
      message.warning("请输入或扫描条码");
      return;
    }
    onScan(code.trim());
    setCode("");
    onClose();
  };

  return (
    <Modal
      open={open}
      title="扫码"
      onOk={handleOk}
      onCancel={onClose}
      okText="确认"
      cancelText="取消"
    >
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <ScanOutlined style={{ fontSize: 48, color: "#1890ff", marginBottom: 16 }} />
        <Input
          placeholder="请扫描条码或手动输入"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onPressEnter={handleOk}
          size="large"
          autoFocus
        />
      </div>
    </Modal>
  );
}
