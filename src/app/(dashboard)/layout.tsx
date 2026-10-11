"use client";

import { SessionProvider } from "next-auth/react";
import AppLayout from "@/components/layout/Sidebar";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: "#2563EB",
            colorBgLayout: "#F8FAFC",
            borderRadius: 8,
            fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Helvetica Neue, PingFang SC, Microsoft YaHei, sans-serif",
            fontSize: 14,
            colorText: "#0F172A",
            colorTextSecondary: "#64748B",
            colorBorder: "#E2E8F0",
            colorBgContainer: "#FFFFFF",
            controlHeight: 36,
          },
          components: {
            Layout: { siderBg: "#fff", headerBg: "rgba(255,255,255,0.85)" },
            Menu: { itemHeight: 40, iconSize: 16 },
            Table: { headerBg: "#F8FAFC", borderColor: "#F1F5F9" },
            Card: { borderRadiusLG: 14 },
            Button: { borderRadius: 8 },
            Input: { borderRadius: 6 },
            Select: { borderRadius: 6 },
            Modal: { borderRadiusLG: 14 },
          },
        }}
      >
        <AppLayout>{children}</AppLayout>
      </ConfigProvider>
    </SessionProvider>
  );
}
