'use client';

import React, { useState, useEffect } from 'react';
import {
  Badge,
  Dropdown,
  Avatar,
  Space,
  Button,
  Tag,
  Empty,
} from 'antd';
import {
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { MenuProps } from 'antd';

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
}

/**
 * 独立版顶栏（1.2.4 分工 A：毛玻璃 + 大圆角 + 移动端不溢出）。
 * 注意：主布局实际使用的是 Sidebar.tsx 内嵌的顶栏，本文件仅作独立复用入口，
 * 行为与之一致（预警角标口径 = 预警中心「全部预警」条数）。
 */
const Header: React.FC = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  // F12：角标口径 = 预警中心「全部预警」条数（不再用未读数，避免铃铛 10 条而中心显示不一致）
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    loadAlerts();
    // 与预警中心保持同步刷新，页面停留久了角标也不会和实际条数漂移
    const timer = setInterval(loadAlerts, 60_000);
    return () => clearInterval(timer);
  }, []);

  const loadAlerts = async () => {
    try {
      // F12：与 /alerts 页面同一个数据源与筛选条件（type=all），total 即中心列表总条数
      const res = await fetch('/api/alerts?type=all&pageSize=10', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setAlerts(data.data.items || []);
        setAlertCount(Number(data.data.total ?? (data.data.items || []).length));
      }
    } catch (e) {
      console.error('加载预警失败:', e);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': return <WarningOutlined style={{ color: '#D32F2F' }} />;
      case 'EXPIRING': return <InfoCircleOutlined style={{ color: '#ED6C02' }} />;
      case 'OVERSTOCK': return <CheckCircleOutlined style={{ color: '#1976D2' }} />;
      default: return <InfoCircleOutlined style={{ color: '#6B7280' }} />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'LOW_STOCK': return 'red';
      case 'EXPIRING': return 'orange';
      case 'OVERSTOCK': return 'blue';
      default: return 'default';
    }
  };

  const notificationItems: MenuProps['items'] = [
    ...(alerts.length > 0 ? alerts.map((alert) => ({
      key: alert.id,
      label: (
        <div style={{ maxWidth: 300, padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {getAlertIcon(alert.type)}
            <span style={{ fontWeight: 500, color: 'var(--text)' }}>{alert.title}</span>
            <Tag color={getAlertColor(alert.type)} style={{ marginLeft: 'auto', fontSize: 11 }}>
              {alert.type === 'LOW_STOCK' ? '库存不足' : alert.type === 'EXPIRING' ? '临期预警' : '其他'}
            </Tag>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 24 }}>
            {alert.message}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 24, marginTop: 4 }}>
            {new Date(alert.createdAt).toLocaleString('zh-CN')}
          </div>
        </div>
      ),
    })) : [{
      key: 'empty',
      label: <Empty description="暂无预警" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
      disabled: true,
    }]),
    { type: 'divider' },
    {
      key: 'view-all',
      label: (
        <div style={{ textAlign: 'center', color: 'var(--primary)', padding: '4px 0' }}>
          查看全部预警
        </div>
      ),
      onClick: () => router.push('/alerts'),
    },
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: (
        <div>
          <div style={{ fontWeight: 500 }}>{session?.user?.name || '用户'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{session?.user?.email || ''}</div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      onClick: () => router.push('/settings'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: () => signOut({ callbackUrl: '/login' }),
    },
  ];

  return (
    <div
      className="yc-header-standalone"
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 24px',
        height: 56,
      }}
    >
      <Space size={20} align="center">
        {/* 消息铃铛 */}
        <Dropdown
          menu={{ items: notificationItems }}
          placement="bottomRight"
          trigger={['click']}
          arrow
          dropdownRender={(menu) => (
            <div style={{
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 12px 32px -12px rgba(16,24,40,0.22)',
              minWidth: 'min(320px, calc(100vw - 32px))',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 400,
              overflow: 'auto',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 500 }}>
                全部预警 {alertCount > 0 && <Badge count={alertCount} style={{ marginLeft: 8 }} />}
              </div>
              {menu}
            </div>
          )}
        >
          {/* F12：角标数 = 预警中心同口径条数 */}
          <Badge count={alertCount} size="small" offset={[-2, 4]}>
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 18 }} />}
              style={{ color: 'var(--text-secondary)' }}
            />
          </Badge>
        </Dropdown>

        {/* 用户头像菜单 */}
        <Dropdown
          menu={{ items: userMenuItems }}
          placement="bottomRight"
          trigger={['click']}
        >
          <Space style={{ cursor: 'pointer' }}>
            <Avatar
              size={32}
              icon={<UserOutlined />}
              style={{ background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)' }}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>
              {session?.user?.name || '用户'}
            </span>
          </Space>
        </Dropdown>
      </Space>
    </div>
  );
};

export default Header;
