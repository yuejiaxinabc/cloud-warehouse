import type { Metadata, Viewport } from "next";
import "./globals.css";
import AntdRegistry from "./AntdRegistry";

/**
 * P2-6：原来 30 个页面共用同一个 title，浏览器标签页全是一模一样的名字，
 * 既不利于多标签识别，也不利于可访问性（读屏只念标题）。
 *
 * 这里给根布局一个模板：子页面只要导出 metadata.title（或 client 页用
 * usePageTitle 设置），就是「页面名 · 云仓智能仓储管理平台」；
 * 没设置的页面退回原标题，不会出现空标题。
 */
export const metadata: Metadata = {
  title: {
    default: "云仓智能仓储管理平台",
    template: "%s · 云仓智能仓储管理平台",
  },
  description: "企业级智能仓储管理 · 商品建档、扫码出入库、货位货架、库存预警与成本核算",
  applicationName: "云仓",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
