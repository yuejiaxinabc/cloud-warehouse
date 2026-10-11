'use client';

import React from 'react';
import { Button, Space, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

/** 按钮配置 */
interface ActionButtonConfig {
  key: string;
  label: string;
  icon?: React.ReactNode;
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text';
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  confirm?: boolean;
}

interface ActionButtonsProps {
  actions: ActionButtonConfig[];
  /** 最多直接显示的按钮数量，超出的收进"更多"菜单 */
  maxVisible?: number;
  size?: 'small' | 'middle' | 'large';
}

/** 操作按钮组组件 */
const ActionButtons: React.FC<ActionButtonsProps> = ({
  actions,
  maxVisible = 3,
  size = 'small',
}) => {
  const visibleActions = actions.slice(0, maxVisible);
  const moreActions = actions.slice(maxVisible);

  const moreMenuItems: MenuProps['items'] = moreActions.map((action) => ({
    key: action.key,
    label: action.label,
    icon: action.icon,
    danger: action.danger,
    disabled: action.disabled,
    onClick: action.onClick,
  }));

  return (
    <Space size={4}>
      {visibleActions.map((action) => (
        <Button
          key={action.key}
          type={action.type || 'link'}
          size={size}
          icon={action.icon}
          danger={action.danger}
          disabled={action.disabled}
          onClick={action.onClick}
          style={{ padding: '0 4px' }}
        >
          {action.label}
        </Button>
      ))}
      {moreActions.length > 0 && (
        <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight">
          <Button type="text" size={size} icon={<MoreOutlined />} />
        </Dropdown>
      )}
    </Space>
  );
};

export default ActionButtons;
