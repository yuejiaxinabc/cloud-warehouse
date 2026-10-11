"use client";

import React, { useState, useEffect } from "react";
import { Layout, Menu, Avatar, Dropdown, Badge, Space, Typography, Tag, Button, Drawer } from "antd";
import type { MenuProps } from "antd";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  DashboardOutlined, ShoppingOutlined, ImportOutlined, ExportOutlined,
  DatabaseOutlined, SwapOutlined, HomeOutlined, AlertOutlined,
  BarChartOutlined, SettingOutlined, UserOutlined, BellOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, LogoutOutlined,
  QrcodeOutlined, TagsOutlined, FileExcelOutlined, ClusterOutlined,
  DollarOutlined, ScanOutlined, FileTextOutlined,
  ShopOutlined, TeamOutlined, MenuOutlined, AppstoreOutlined, ShoppingCartOutlined,
} from "@ant-design/icons";

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const OPERATOR_PATHS = ["/", "/stock-out", "/inventory", "/stocktake", "/bom", "/customers", "/serial", "/labels", "/purchase-requests"];

const menuItems: MenuProps["items"] = [
  { key: "/", icon: <DashboardOutlined />, label: "工作台" },
  { key: "/products", icon: <ShoppingOutlined />, label: "商品管理" },
  { key: "/purchase-requests", icon: <ShoppingCartOutlined />, label: "购买申请" },
  { key: "/stock-in", icon: <ImportOutlined />, label: "扫码入库" },
  { key: "/stock-out", icon: <ExportOutlined />, label: "扫码出库" },
  { key: "/inventory", icon: <DatabaseOutlined />, label: "库存查询" },
  { key: "/stocktake", icon: <ScanOutlined />, label: "盘点管理" },
  { key: "/transfers", icon: <SwapOutlined />, label: "调拨管理" },
  { key: "/warehouse", icon: <HomeOutlined />, label: "仓库管理" },
  { key: "/shelf-map", icon: <AppstoreOutlined />, label: "货架地图" },
  { key: "/suppliers", icon: <ShopOutlined />, label: "供应商管理" },
  { key: "/customers", icon: <TeamOutlined />, label: "客户管理" },
  { key: "/alerts", icon: <AlertOutlined />, label: "预警中心" },
  { key: "/reports", icon: <BarChartOutlined />, label: "报表中心" },
  { key: "/bom", icon: <ClusterOutlined />, label: "BOM管理" },
  { key: "/serial", icon: <QrcodeOutlined />, label: "序列号追踪" },
  { key: "/labels", icon: <TagsOutlined />, label: "条码打印" },
  { key: "/export", icon: <FileExcelOutlined />, label: "Excel导出" },
  { key: "/cost", icon: <DollarOutlined />, label: "成本核算" },
  { key: "/logs", icon: <FileTextOutlined />, label: "操作日志" },
  { key: "/settings", icon: <SettingOutlined />, label: "系统设置" },
];

interface AlertItem {
  id: string;
  level: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [companyName] = useState("云仓智能仓储管理平台");

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setCollapsed(true);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  const getFilteredMenu = (): MenuProps["items"] => {
    const roles = (session?.user as any)?.roles || [];
    if (roles.includes("ADMIN") || roles.includes("admin")) return menuItems;
    if (roles.includes("operator")) return menuItems?.filter((item: any) => OPERATOR_PATHS.includes(item?.key));
    return menuItems;
  };

  const getSelectedKey = () => {
    if (pathname === "/") return "/";
    const match = pathname.match(/^\/[^\/]+/);
    return match ? match[0] : "/";
  };

  const handleMenuClick = (key: string) => {
    router.push(key);
    if (isMobile) setMobileDrawerOpen(false);
  };

  const alertMenu: MenuProps["items"] = alerts.length > 0
    ? [
        ...alerts.slice(0, 5).map((alert) => ({
          key: alert.id,
          label: (
            <div style={{ maxWidth: 280, padding: "4px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Tag color={alert.level === "CRITICAL" ? "red" : alert.level === "WARNING" ? "orange" : "blue"} style={{ margin: 0 }}>
                  {alert.level === "CRITICAL" ? "紧急" : alert.level === "WARNING" ? "警告" : "提示"}
                </Tag>
                <Text strong style={{ fontSize: 13 }}>{alert.title}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>{alert.content}</Text>
            </div>
          ),
          onClick: () => router.push("/alerts"),
        })),
        { type: "divider" },
        { key: "view-all", label: <div style={{ textAlign: "center", color: "var(--primary)", fontSize: 13 }}>查看全部预警</div>, onClick: () => router.push("/alerts") },
      ]
    : [{ key: "empty", label: <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 12, fontSize: 13 }}>暂无预警</div>, disabled: true }];

  const userMenu: MenuProps["items"] = [
    { key: "profile", icon: <UserOutlined />, label: "个人资料", onClick: () => router.push("/settings") },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true, onClick: () => signOut({ callbackUrl: "/login" }) },
  ];

  const siderContent = (
    <>
      <div style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "0" : "0 14px",
        borderBottom: "1px solid var(--border-light)",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, overflow: "hidden", background: "#fff",
          border: "1px solid var(--border)",
        }}>
          <img src="/logo.png" alt="" style={{ width: 32, height: 32, objectFit: "cover" }} />
        </div>
        {!collapsed && (
          <span style={{ color: "var(--text)", fontSize: 15, fontWeight: 600, marginLeft: 10, whiteSpace: "nowrap" }}>
            {companyName}
          </span>
        )}
      </div>
      <Menu
        theme="light"
        mode="inline"
        selectedKeys={[getSelectedKey()]}
        items={getFilteredMenu()}
        onClick={({ key }) => handleMenuClick(key)}
        style={{ borderRight: "none", marginTop: 6 }}
      />
    </>
  );

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      {!isMobile && (
        <Sider
          collapsed={collapsed}
          width={220}
          collapsedWidth={56}
          style={{
            overflow: "auto", height: "100dvh",
            position: "fixed", left: 0, top: 0, bottom: 0,
            background: "#fff", zIndex: 200,
          }}
        >
          {siderContent}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          onClose={() => setMobileDrawerOpen(false)}
          open={mobileDrawerOpen}
          width={260}
          styles={{ body: { padding: 0, background: "#fff" } }}
          closable={false}
        >
          {siderContent}
        </Drawer>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : collapsed ? 56 : 220, transition: "margin-left 0.2s ease" }}>
        <Header style={{
          padding: isMobile ? "0 12px" : "0 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 100,
          height: 56, lineHeight: "56px",
        }}>
          <Space>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileDrawerOpen(true)} style={{ fontSize: 18, color: "var(--text)" }} />
            )}
            {!isMobile && (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{ fontSize: 16, color: "var(--text-secondary)" }}
              />
            )}
          </Space>

          <Space size={isMobile ? 8 : 14}>
            <Dropdown menu={{ items: alertMenu }} placement="bottomRight" trigger={["click"]}>
              <Badge count={unreadCount} size="small" offset={[-2, 4]}>
                <BellOutlined style={{ fontSize: isMobile ? 16 : 18, color: "var(--text-secondary)", cursor: "pointer" }} />
              </Badge>
            </Dropdown>
            <Dropdown menu={{ items: userMenu }} placement="bottomRight" trigger={["click"]}>
              <Space style={{ cursor: "pointer" }} size={8}>
                <Avatar
                  icon={<UserOutlined />}
                  style={{ background: "var(--primary)", width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, fontSize: isMobile ? 13 : 15 }}
                />
                {!isMobile && <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 500 }}>{session?.user?.name || "用户"}</span>}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ padding: isMobile ? 12 : 20, minHeight: "calc(100dvh - 56px)" }}>
          {children}
        </Content>

        <div style={{
          textAlign: "center", padding: isMobile ? "12px 0" : "16px 0",
          color: "var(--text-muted)", fontSize: isMobile ? 11 : 12,
        }}>
          © {new Date().getFullYear()} {companyName}
        </div>
      </Layout>
    </Layout>
  );
}
