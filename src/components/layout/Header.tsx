'use client';

import React, { useState, useEffect } from 'react';
import {
  Badge,
  Dropdown,
  Avatar,
  Space,
  Button,
  List,
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
import type { MenuProps } from 'antd';

interface AlertItem {
  id: string;
  type: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
}

const Header: React.FC = () => {
  const { data: session } = useSession();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      const res = await fetch('/api/alerts?status=UNREAD&pageSize=5');
      const data = await res.json();
      if (data.success) {
        setAlerts(data.data.items || []);
        setUnreadCount(data.data.total || 0);
      }
    } catch (e) {
      console.error('加载通知失败:', e);
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
            <span style={{ fontWeight: 500, color: '#374151' }}>{alert.title}</span>
            <Tag color={getAlertColor(alert.type)} style={{ marginLeft: 'auto', fontSize: 11 }}>
              {alert.type === 'LOW_STOCK' ? '库存不足' : alert.type === 'EXPIRING' ? '临期预警' : '其他'}
            </Tag>
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', paddingLeft: 24 }}>
            {alert.message}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', paddingLeft: 24, marginTop: 4 }}>
            {new Date(alert.createdAt).toLocaleString('zh-CN')}
          </div>
        </div>
      ),
    })) : [{
      key: 'empty',
      label: <Empty description="暂无新通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
      disabled: true,
    }]),
    { type: 'divider' },
    {
      key: 'view-all',
      label: (
        <div style={{ textAlign: 'center', color: '#1976D2', padding: '4px 0' }}>
          查看全部通知
        </div>
      ),
      onClick: () => window.location.href = '/alerts',
    },
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: (
        <div>
          <div style={{ fontWeight: 500 }}>{session?.user?.name || '用户'}</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>{session?.user?.email || ''}</div>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      onClick: () => window.location.href = '/settings',
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
    <div style={{
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      padding: '0 24px',
      height: 56,
      background: '#fff',
      borderBottom: '1px solid #E5E7EB',
    }}>
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
              borderRadius: 8,
              boxShadow: '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)',
              minWidth: 320,
              maxHeight: 400,
              overflow: 'auto',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 500 }}>
                通知 {unreadCount > 0 && <Badge count={unreadCount} style={{ marginLeft: 8 }} />}
              </div>
              {menu}
            </div>
          )}
        >
          <Badge count={unreadCount} size="small" offset={[-2, 4]}>
            <Button
              type="text"
              icon={<BellOutlined style={{ fontSize: 18 }} />}
              style={{ color: '#6B7280' }}
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
              style={{ backgroundColor: '#1890ff' }}
            />
            <span style={{ fontSize: 13, color: '#374151' }}>
              {session?.user?.name || '用户'}
            </span>
          </Space>
        </Dropdown>
      </Space>
    </div>
  );
};

export default Header;
