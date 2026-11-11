"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { Modal, Input, Button, message, Typography } from "antd";
import { ScanOutlined, CameraOutlined } from "@ant-design/icons";

// 摄像头组件只在客户端挂载（与扫码入库页一致）
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), { ssr: false });

const { Text } = Typography;

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export function ScanModal({ open, onClose, onScan }: ScanModalProps) {
  const [code, setCode] = useState("");
  // 默认直接尝试拉起摄像头；摄像头不可用时手动输入框始终在下方可见，不会卡在“正在启动摄像头…”
  const [showCamera, setShowCamera] = useState(true);
  // L6：每个实例生成唯一 id，label/aria 通过它绑定输入框，避免多实例同时挂载时 id 重复
  const inputId = React.useId();

  const handleOk = () => {
    if (!code.trim()) {
      message.warning("请输入或扫描条码");
      return;
    }
    onScan(code.trim());
    setCode("");
    onClose();
  };

  const handleCameraScan = (scanned: string) => {
    setShowCamera(false);
    onScan(scanned);
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
      // L6：关闭即卸载，弹窗内容不会常驻 DOM，杜绝重复 id
      destroyOnClose
    >
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <ScanOutlined style={{ fontSize: 48, color: "#1890ff", marginBottom: 16 }} />
        {showCamera ? (
          <div style={{ marginBottom: 12, textAlign: "left" }}>
            <BarcodeScanner onScan={handleCameraScan} onClose={() => setShowCamera(false)} />
            <Button block style={{ marginTop: 8 }} onClick={() => setShowCamera(false)}>
              关闭摄像头，改用手动输入
            </Button>
          </div>
        ) : (
          <Button block icon={<CameraOutlined />} style={{ marginBottom: 12 }} onClick={() => setShowCamera(true)}>
            打开摄像头扫码
          </Button>
        )}
        {/* 手动输入框始终可见：摄像头启动失败、无摄像头或一直“正在启动”时，可直接在此输入 */}
        <Input
          id={inputId}
          aria-label="条码"
          placeholder="请扫描条码或手动输入"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onPressEnter={handleOk}
          size="large"
          autoFocus
        />
        <Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
          摄像头无法启动时，请直接在上方输入框手动输入条码后点“确认”
        </Text>
      </div>
    </Modal>
  );
}

// src/components/ui/index.ts 以 default 方式再导出，这里补一个默认导出（与具名导出并存）
export default ScanModal;
