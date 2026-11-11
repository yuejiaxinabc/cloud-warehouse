'use client';

import React from 'react';
import { createCache, extractStyle, StyleProvider } from '@ant-design/cssinjs';
import type Entity from '@ant-design/cssinjs/es/Cache';
import { useServerInsertedHTML } from 'next/navigation';
import type { ThemeConfig } from 'antd';

/**
 * 苹果风主题 token（1.2.4 分工 A）——与 tailwind.config.ts / globals.css 同一套数值：
 * 卡片 22px、按钮/输入 12px、弹窗 24px；主色 #2563EB。
 *
 * 注意：当前生效的 ConfigProvider 在 src/app/(dashboard)/layout.tsx（不在本次
 * 分工 A 的改动范围内），那里仍写着旧 token（borderRadius 10 / LG 14 / 按钮 9）。
 * 协调员收尾时请把那处 theme 换成这里导出的 `appleTheme`，即完成 Antd 与
 * Tailwind 的统一；globals.css 里的 !important 覆盖已先保证两者视觉一致。
 */
export const appleTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2563EB',
    colorInfo: '#2563EB',
    colorSuccess: '#16A34A',
    colorWarning: '#D97706',
    colorError: '#DC2626',
    colorBgLayout: '#F6F8FB',
    colorBgContainer: '#FFFFFF',
    colorText: '#0B1220',
    colorTextSecondary: '#5B6779',
    colorTextTertiary: '#93A0B4',
    colorBorder: '#E7EBF0',
    colorBorderSecondary: '#F0F3F7',
    borderRadius: 12,
    borderRadiusLG: 22,
    borderRadiusSM: 12,
    borderRadiusXS: 10,
    controlHeight: 38,
    fontSize: 14,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 4px 16px rgba(16,24,40,0.04)',
    boxShadowSecondary: '0 12px 32px -12px rgba(16,24,40,0.22)',
    wireframe: false,
  },
  components: {
    Layout: { siderBg: '#FFFFFF', headerBg: 'transparent', bodyBg: '#F6F8FB' },
    Menu: {
      itemHeight: 40,
      itemBorderRadius: 12,
      itemMarginInline: 0,
      itemSelectedBg: '#EFF6FF',
      itemSelectedColor: '#2563EB',
      itemHoverBg: '#F5F8FC',
      subMenuItemBg: 'transparent',
      iconSize: 16,
    },
    Table: {
      headerBg: '#F8FAFC',
      headerColor: '#5B6779',
      borderColor: '#F0F3F7',
      rowHoverBg: '#FAFBFD',
      cellPaddingBlock: 10,
    },
    Card: { borderRadiusLG: 22, paddingLG: 20 },
    Button: { borderRadius: 12, primaryShadow: '0 1px 2px rgba(37,99,235,.24)' },
    Input: { borderRadius: 12 },
    Select: { borderRadius: 12 },
    InputNumber: { borderRadius: 12 },
    Modal: { borderRadiusLG: 24 },
    Drawer: { borderRadiusLG: 24 },
    Tag: { borderRadiusSM: 6 },
    Tooltip: { borderRadius: 12 },
  },
};

/**
 * Ant Design 5 样式注册表
 * 解决 Next.js App Router 中 antd 样式闪烁问题
 */
const AntdRegistry = ({ children }: { children: React.ReactNode }) => {
  const cache = React.useMemo<Entity>(() => createCache(), []);
  const isServerInserted = React.useRef<boolean>(false);

  useServerInsertedHTML(() => {
    if (isServerInserted.current) {
      return;
    }
    isServerInserted.current = true;
    return (
      <style id="antd" dangerouslySetInnerHTML={{ __html: extractStyle(cache, true) }} />
    );
  });

  return <StyleProvider cache={cache}>{children}</StyleProvider>;
};

export default AntdRegistry;
