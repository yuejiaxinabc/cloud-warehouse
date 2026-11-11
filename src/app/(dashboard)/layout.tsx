"use client";

import { SessionProvider } from "next-auth/react";
import AppLayout from "@/components/layout/Sidebar";
import { ConfigProvider, App as AntApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { appleTheme } from "../AntdRegistry";

/**
 * 全局主题（v1.2.4 苹果风）
 * 设计基调：白底 + 蓝主色 + 大圆角 + 极轻阴影，信息密度靠留白控制而不是描边。
 * token 唯一事实来源：src/app/AntdRegistry.tsx 导出的 appleTheme，
 * 与 tailwind.config.ts / globals.css 同一套数值（卡片 22px、按钮/输入 12px、弹窗 24px）。
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ConfigProvider locale={zhCN} theme={appleTheme}>
        <AntApp>
          <AppLayout>{children}</AppLayout>
        </AntApp>
      </ConfigProvider>
    </SessionProvider>
  );
}
