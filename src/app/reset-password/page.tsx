"use client";

import React, { useState, useEffect, Suspense } from "react";
import { Input, Button, message, Card, Typography } from "antd";
import { UserOutlined, SafetyOutlined, LockOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";

const { Text } = Typography;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    setFadeIn(true);
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  const handleReset = async () => {
    if (!username.trim()) { message.warning("请输入用户名"); return; }
    if (!token.trim()) { message.warning("请输入重置令牌"); return; }
    if (!newPassword) { message.warning("请输入新密码"); return; }
    if (newPassword.length < 8) { message.warning("新密码至少8位"); return; }
    if (newPassword !== confirmPassword) { message.warning("两次密码不一致"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", username: username.trim(), token: token.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || "密码重置成功");
        setDone(true);
      } else {
        message.error(data.error || "重置失败");
      }
    } catch { message.error("网络异常"); }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F8FAFC", padding: "0 20px",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, opacity: fadeIn ? 1 : 0,
        transform: fadeIn ? "translateY(0)" : "translateY(12px)",
        transition: "all 0.5s ease",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>云仓智能仓储管理平台</div>
          <Text type="secondary" style={{ fontSize: 14 }}>使用管理员提供的令牌重置密码</Text>
        </div>

        <Card style={{ borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }} styles={{ body: { padding: 32 } }}>
          {!done ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Input
                prefix={<UserOutlined style={{ color: "#64748B" }} />}
                placeholder="用户名"
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{ height: 44, borderRadius: 8 }}
                maxLength={32}
                disabled={loading}
                autoFocus
              />
              <Input
                prefix={<SafetyOutlined style={{ color: "#64748B" }} />}
                placeholder="重置令牌"
                value={token}
                onChange={e => setToken(e.target.value)}
                style={{ height: 44, borderRadius: 8, fontFamily: "monospace", letterSpacing: "0.05em" }}
                disabled={loading}
              />
              <Input.Password
                prefix={<LockOutlined style={{ color: "#64748B" }} />}
                placeholder="新密码（至少8位）"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={{ height: 44, borderRadius: 8 }}
                maxLength={64}
                disabled={loading}
              />
              <Input.Password
                prefix={<LockOutlined style={{ color: "#64748B" }} />}
                placeholder="确认新密码"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                onPressEnter={handleReset}
                style={{ height: 44, borderRadius: 8 }}
                maxLength={64}
                disabled={loading}
              />
              <Button type="primary" block onClick={handleReset} loading={loading}
                style={{ height: 44, borderRadius: 8, fontWeight: 600, background: "#2563EB", borderColor: "#2563EB" }}>
                重置密码
              </Button>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#0F172A", marginBottom: 8 }}>密码重置成功</div>
              <Text type="secondary">请使用新密码登录</Text>
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => router.push("/login")}
              style={{ fontSize: 13, color: "#64748B" }}>
              返回登录
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>加载中...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
