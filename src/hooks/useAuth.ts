'use client';

import { useState, useCallback, useEffect } from 'react';

/** 用户信息 */
interface UserInfo {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar?: string;
  role: string;
  permissions: string[];
  orgId: string;
  orgName: string;
}

interface UseAuthReturn {
  /** 当前用户 */
  user: UserInfo | null;
  /** 是否已登录 */
  isAuthenticated: boolean;
  /** 加载中 */
  loading: boolean;
  /** 登录 */
  login: (username: string, password: string) => Promise<boolean>;
  /** 登出 */
  logout: () => Promise<void>;
  /** 检查权限 */
  hasPermission: (permission: string) => boolean;
  /** 刷新用户信息 */
  refreshUser: () => Promise<void>;
}

/** 演示用户数据 */
const mockUser: UserInfo = {
  id: 'user-001',
  username: 'admin',
  name: '管理员',
  email: 'admin@company.com',
  avatar: undefined,
  role: 'admin',
  permissions: [
    'product.view', 'product.create', 'product.edit', 'product.delete',
    'stock_in.view', 'stock_in.create', 'stock_in.edit', 'stock_in.post',
    'stock_out.view', 'stock_out.create', 'stock_out.edit', 'stock_out.post',
    'inventory.view', 'inventory.export',
    'stocktake.view', 'stocktake.create', 'stocktake.edit',
    'transfer.view', 'transfer.create', 'transfer.edit',
    'warehouse.view', 'warehouse.create', 'warehouse.edit',
    'alert.view', 'alert.manage',
    'report.view', 'report.export',
    'bom.view', 'bom.create', 'bom.edit',
    'user.view', 'user.manage',
    'role.view', 'role.manage',
    'audit.view',
  ],
  orgId: 'org-001',
  orgName: '总部',
};

/** 认证状态 Hook */
const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<UserInfo | null>(mockUser);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!user;

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      // 实际项目中调用登录 API
      // const res = await fetch('/api/auth/login', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ username, password }),
      // });
      // if (!res.ok) return false;
      // const data = await res.json();
      // setUser(data.user);

      await new Promise((resolve) => setTimeout(resolve, 500));
      setUser(mockUser);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // 实际项目中调用登出 API
    // await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.permissions.includes(permission);
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    // 实际项目中调用刷新用户信息 API
    // const res = await fetch('/api/auth/me');
    // const data = await res.json();
    // setUser(data.user);
  }, []);

  return { user, isAuthenticated, loading, login, logout, hasPermission, refreshUser };
};

export default useAuth;
