"use client";

import React from "react";
import { Button, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";

interface ExportButtonProps {
  module: string;
  filters?: Record<string, unknown>;
  fileName?: string;
}

export function ExportButton({ module, filters, fileName }: ExportButtonProps) {
  const handleExport = async () => {
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, filters, fileName }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName || `${module}_export.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        message.success("导出成功");
      } else {
        message.error("导出失败");
      }
    } catch {
      message.error("导出失败");
    }
  };

  return (
    <Button icon={<DownloadOutlined />} onClick={handleExport}>
      导出Excel
    </Button>
  );
}
