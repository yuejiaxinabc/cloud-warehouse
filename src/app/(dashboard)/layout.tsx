"use client";

import { SessionProvider } from "next-auth/react";
import AppLayout from "@/components/layout/Sidebar";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";

/**
 * 全局主题（v1.1.1 重构）
 * 设计基调：白底 + 蓝主色 + 大圆角 + 极轻阴影，信息密度靠留白控制而不是描边。
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: "#2563EB",
            colorInfo: "#2563EB",
            colorSuccess: "#16A34A",
            colorWarning: "#D97706",
            colorError: "#DC2626",
            colorBgLayout: "#F6F8FB",
            colorBgContainer: "#FFFFFF",
            colorText: "#0B1220",
            colorTextSecondary: "#5B6779",
            colorTextTertiary: "#93A0B4",
            colorBorder: "#E7EBF0",
            colorBorderSecondary: "#F0F3F7",
            borderRadius: 10,
            borderRadiusLG: 14,
            borderRadiusSM: 8,
            controlHeight: 36,
            fontSize: 14,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
            boxShadow: "0 4px 16px rgba(16,24,40,0.06)",
            boxShadowSecondary: "0 8px 28px rgba(16,24,40,0.10)",
            wireframe: false,
          },
          components: {
            Layout: { siderBg: "#FFFFFF", headerBg: "transparent", bodyBg: "#F6F8FB" },
            Menu: {
              itemHeight: 40,
              itemBorderRadius: 10,
              itemMarginInline: 0,
              itemSelectedBg: "#EFF6FF",
              itemSelectedColor: "#2563EB",
              itemHoverBg: "#F5F8FC",
              subMenuItemBg: "transparent",
              iconSize: 16,
            },
            Table: {
              headerBg: "#F8FAFC",
              headerColor: "#5B6779",
              borderColor: "#F0F3F7",
              rowHoverBg: "#FAFBFD",
              cellPaddingBlock: 10,
            },
            Card: { borderRadiusLG: 16, paddingLG: 20 },
            Button: { borderRadius: 9, primaryShadow: "0 1px 2px rgba(37,99,235,.24)" },
            Input: { borderRadius: 8 },
            Select: { borderRadius: 8 },
            InputNumber: { borderRadius: 8 },
            Modal: { borderRadiusLG: 16 },
            Drawer: { borderRadiusLG: 16 },
            Tag: { borderRadiusSM: 6 },
            Tooltip: { borderRadius: 8 },
          },
        }}
      >
        <AntApp>
          <AppLayout>{children}</AppLayout>
        </AntApp>
      </ConfigProvider>
    </SessionProvider>
  );
}
