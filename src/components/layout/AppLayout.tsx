'use client';

import React, { useState } from 'react';
import { Layout } from 'antd';
import Sidebar from './Sidebar';
import Header from './Header';

const { Content } = Layout;

interface AppLayoutProps {
  children: React.ReactNode;
}

/** 应用主布局组件：组合 Sidebar + Header */
const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: '100dvh' }}>
      {/* 侧边栏 */}
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />

      {/* 右侧内容区 */}
      <Layout
        style={{
          marginLeft: collapsed ? 80 : 220,
          transition: 'margin-left 0.2s',
        }}
      >
        {/* 顶部栏 */}
        <Header />

        {/* 页面内容 */}
        <Content
          style={{
            padding: 0,
            minHeight: 'calc(100dvh - 56px)',
            background: '#F5F7FA',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
