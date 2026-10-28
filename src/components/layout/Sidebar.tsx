"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Layout, Menu, Avatar, Dropdown, Badge, Space, Typography, Tag, Button, Drawer, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  DashboardOutlined, ShoppingOutlined, ImportOutlined, ExportOutlined,
  DatabaseOutlined, SwapOutlined, HomeOutlined, AlertOutlined,
  BarChartOutlined, SettingOutlined, UserOutlined, BellOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, LogoutOutlined,
  QrcodeOutlined, TagsOutlined, FileExcelOutlined, ClusterOutlined,
  DollarOutlined, FileTextOutlined, ShopOutlined, TeamOutlined,
  MenuOutlined, AppstoreOutlined, ShoppingCartOutlined, PieChartOutlined,
  ScanOutlined, DownOutlined, RocketOutlined, FundProjectionScreenOutlined, DeleteOutlined, SafetyOutlined, ExperimentOutlined,
} from "@ant-design/icons";
import { LogoMark } from "@/components/brand/Logo";

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const APP_VERSION = "1.2.0";
const COLLAPSE_KEY = "yc.sider.collapsed";

/** 分组菜单：默认折叠，点开才展开，避免一屏堆 23 个入口 */
type NavNode = {
  key: string;
  icon?: React.ReactNode;
  label: string;
  children?: NavNode[];
};

const NAV: NavNode[] = [
  { key: "/", icon: <DashboardOutlined />, label: "工作台" },
  {
    key: "g-product",
    icon: <ShoppingOutlined />,
    label: "商品与主数据",
    children: [
      { key: "/products", icon: <ShoppingOutlined />, label: "商品管理" },
      { key: "/products/io", icon: <FileExcelOutlined />, label: "导入 / 导出" },
      { key: "/suppliers", icon: <ShopOutlined />, label: "供应商" },
      { key: "/customers", icon: <TeamOutlined />, label: "客户" },
      { key: "/bom", icon: <ClusterOutlined />, label: "BOM 清单" },
    ],
  },
  {
    key: "g-move",
    icon: <SwapOutlined />,
    label: "库存作业",
    children: [
      { key: "/stock-in", icon: <ImportOutlined />, label: "扫码入库" },
      { key: "/stock-out", icon: <ExportOutlined />, label: "扫码出库" },
      { key: "/purchase-requests", icon: <ShoppingCartOutlined />, label: "购买申请" },
      { key: "/stocktake", icon: <ScanOutlined />, label: "盘点管理" },
      { key: "/transfers", icon: <SwapOutlined />, label: "调拨管理" },
    ],
  },
  {
    key: "g-stock",
    icon: <DatabaseOutlined />,
    label: "库存与仓库",
    children: [
      { key: "/inventory", icon: <DatabaseOutlined />, label: "库存查询" },
      { key: "/inventory/analysis", icon: <BarChartOutlined />, label: "库存分析" },
      { key: "/inventory/lots", icon: <ExperimentOutlined />, label: "批次与效期" },
      { key: "/shelf-map", icon: <AppstoreOutlined />, label: "货架地图" },
      { key: "/warehouse", icon: <HomeOutlined />, label: "仓库管理" },
      { key: "/alerts", icon: <AlertOutlined />, label: "预警中心" },
    ],
  },
  {
    key: "g-report",
    icon: <PieChartOutlined />,
    label: "报表与工具",
    children: [
      { key: "/reports", icon: <BarChartOutlined />, label: "报表中心" },
      { key: "/serial", icon: <QrcodeOutlined />, label: "序列号追踪" },
      { key: "/labels", icon: <TagsOutlined />, label: "条码打印" },
      { key: "/export", icon: <FileExcelOutlined />, label: "Excel 导出" },
      { key: "/cost", icon: <DollarOutlined />, label: "成本核算" },
      { key: "/screen", icon: <FundProjectionScreenOutlined />, label: "现场大屏" },
    ],
  },
  {
    key: "g-system",
    icon: <SettingOutlined />,
    label: "系统",
    children: [
      { key: "/logs", icon: <FileTextOutlined />, label: "操作日志" },
      { key: "/setup", icon: <RocketOutlined />, label: "初始化向导" },
      { key: "/trash", icon: <DeleteOutlined />, label: "回收站" },
      { key: "/security", icon: <SafetyOutlined />, label: "安全与集成" },
      { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
    ],
  },
];

interface AlertItem {
  id: string;
  level: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
}

/** 找出当前路径对应的菜单项与所属分组 */
function resolveActive(pathname: string) {
  const flat: NavNode[] = [];
  const parents = new Map<string, string>();
  for (const node of NAV) {
    if (node.children) {
      for (const child of node.children) {
        flat.push(child);
        parents.set(child.key, node.key);
      }
    } else {
      flat.push(node);
    }
  }
  const sorted = [...flat].sort((a, b) => b.key.length - a.key.length);
  const hit =
    sorted.find((item) => pathname === item.key) ||
    sorted.find((item) => item.key !== "/" && pathname.startsWith(item.key + "/")) ||
    null;
  return { selectedKey: hit?.key ?? pathname, parentKey: hit ? parents.get(hit.key) : undefined };
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const { data: session } = useSession();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const companyName = "云仓智能仓储管理平台";

  const { selectedKey, parentKey } = useMemo(() => resolveActive(pathname), [pathname]);

  // 折叠状态记忆
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 992;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 自动展开当前分组（用户手动点开的其它分组保持打开）
  useEffect(() => {
    if (!parentKey) return;
    setOpenKeys((prev) => (prev.includes(parentKey) ? prev : [...prev, parentKey]));
  }, [parentKey]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch("/api/alerts?pageSize=10");
        const data = await res.json();
        if (data.success) {
          const items = data.data?.items || [];
          setAlerts(items);
          setUnreadCount(items.filter((a: AlertItem) => a.status === "UNREAD").length);
        }
      } catch {}
    };
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(timer);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {}
  };

  const goto = (key: string) => {
    router.push(key);
    if (isMobile) setMobileOpen(false);
  };

  const alertMenu: MenuProps["items"] =
    alerts.length > 0
      ? [
          ...alerts.slice(0, 5).map((alert) => ({
            key: alert.id,
            label: (
              <div style={{ maxWidth: 300, padding: "2px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Tag
                    color={alert.level === "CRITICAL" ? "red" : alert.level === "WARNING" ? "orange" : "blue"}
                    style={{ margin: 0 }}
                  >
                    {alert.level === "CRITICAL" ? "紧急" : alert.level === "WARNING" ? "警告" : "提示"}
                  </Tag>
                  <Text strong style={{ fontSize: 13 }}>{alert.title}</Text>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{alert.content}</Text>
              </div>
            ),
            onClick: () => goto("/alerts"),
          })),
          { type: "divider" as const },
          {
            key: "view-all",
            label: <div style={{ textAlign: "center", color: "var(--primary)", fontSize: 13 }}>查看全部预警</div>,
            onClick: () => goto("/alerts"),
          },
        ]
      : [
          {
            key: "empty",
            label: <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 10, fontSize: 13 }}>暂无预警</div>,
            disabled: true,
          },
        ];

  const userMenu: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: "个人资料", onClick: () => goto("/settings") },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "退出登录",
      danger: true,
      onClick: () => signOut({ callbackUrl: "/login" }),
    },
  ];

  const menuItems = useMemo<MenuProps["items"]>(
    () =>
      NAV.map((node) => ({
        key: node.key,
        icon: node.icon,
        label: node.label,
        children: node.children?.map((c) => ({ key: c.key, icon: c.icon, label: c.label })),
      })),
    []
  );

  const nav = (
    <div className="yc-nav">
      <div className={`yc-nav-brand ${collapsed ? "is-collapsed" : ""}`}>
        <div className="yc-nav-brand-inner" onClick={() => goto("/")}>
          {collapsed ? (
            <LogoMark size={34} />
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <LogoMark size={34} />
              <div style={{ lineHeight: 1.25, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: 0.4 }}>云仓</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>智能仓储管理平台</div>
              </div>
            </div>
          )}
        </div>
        {!collapsed && !isMobile && (
          <Tooltip title="收起菜单" placement="right">
            <button className="yc-nav-collapse" onClick={toggleCollapsed} aria-label="收起菜单">
              <MenuFoldOutlined />
            </button>
          </Tooltip>
        )}
      </div>

      <Menu
        mode="inline"
        className="yc-menu"
        selectedKeys={[selectedKey]}
        openKeys={collapsed ? undefined : openKeys}
        onOpenChange={(keys) => setOpenKeys(keys as string[])}
        items={menuItems}
        inlineIndent={16}
        onClick={({ key }) => {
          if (String(key).startsWith("g-")) return;
          goto(key);
        }}
      />

      {!collapsed && (
        <div className="yc-nav-foot">
          <span>v{APP_VERSION}</span>
          <span>{new Date().getFullYear()} · 云仓</span>
        </div>
      )}
    </div>
  );

  return (
    <Layout style={{ minHeight: "100dvh", background: "var(--bg)" }}>
      {!isMobile && (
        <Sider
          width={236}
          collapsedWidth={72}
          collapsed={collapsed}
          trigger={null}
          className="yc-sider"
          style={{
            position: "fixed",
            inset: "0 auto 0 0",
            height: "100dvh",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          {nav}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          width={252}
          closable={false}
          styles={{ body: { padding: 0 } }}
        >
          {nav}
        </Drawer>
      )}

      <Layout
        style={{
          marginLeft: isMobile ? 0 : collapsed ? 72 : 236,
          transition: "margin-left .22s cubic-bezier(.16,1,.3,1)",
          background: "var(--bg)",
        }}
      >
        <Header className="yc-header">
          <Space size={10}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} />
            )}
            {!isMobile && collapsed && (
              <Tooltip title="展开菜单" placement="right">
                <Button type="text" icon={<MenuUnfoldOutlined />} onClick={toggleCollapsed} />
              </Tooltip>
            )}
          </Space>

          <Space size={isMobile ? 6 : 16}>
            <Dropdown menu={{ items: alertMenu }} placement="bottomRight" trigger={["click"]}>
              <Badge count={unreadCount} size="small" offset={[-2, 3]}>
                <button className="yc-icon-btn" aria-label="预警">
                  <BellOutlined />
                </button>
              </Badge>
            </Dropdown>

            <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={["click"]}>
              <div className="yc-user">
                <Avatar
                  size={isMobile ? 26 : 30}
                  style={{ background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", fontSize: 13 }}
                >
                  {(session?.user?.name || "用").slice(0, 1)}
                </Avatar>
                {!isMobile && (
                  <div className="yc-user-meta">
                    <span className="yc-user-name">{session?.user?.name || "用户"}</span>
                    <span className="yc-user-role">
                      {((session?.user as any)?.roles || [])[0] || "member"}
                    </span>
                  </div>
                )}
                {!isMobile && <DownOutlined className="yc-user-caret" />}
              </div>
            </Dropdown>
          </Space>
        </Header>

        <Content className="yc-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
