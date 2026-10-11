"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Form, Input, Button, message, Typography, Spin } from "antd";
import {
  UserOutlined, LockOutlined,
  PhoneOutlined, CustomerServiceOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const { Text } = Typography;
// 验证码改为服务端生成 SVG + 服务端一次性校验（FIX-2026-1002），本地生成/绘制逻辑已移除

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [systemInfo, setSystemInfo] = useState({ companyName: "云仓智能仓储管理平台", contactPhone: "" });
  const [fadeIn, setFadeIn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();

  useEffect(() => { setTimeout(() => setFadeIn(true), 50); }, []);

  useEffect(() => {
    fetch("/api/settings/system")
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          setSystemInfo({
            companyName: d.data.companyName || "云仓智能仓储管理平台",
            contactPhone: d.data.contactPhone || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  const refreshCaptcha = useCallback(async () => {
    setCaptchaInput("");
    try {
      const res = await fetch("/api/auth/captcha?" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      setCaptchaToken(data.token || "");
      setCaptchaSvg(data.svg || "");
    } catch {
      setCaptchaToken("");
      setCaptchaSvg("");
    }
  }, []);

  useEffect(() => { refreshCaptcha(); }, [refreshCaptcha]);

  const onFinish = async (values: { username: string; password: string }) => {
    if (!agreed) { message.warning("请先阅读并同意服务协议和隐私政策"); return; }
    if (!captchaInput.trim()) { message.warning("请输入验证码"); return; }

    setLoading(true);
    try {
      // 服务端一次性校验验证码（FIX-2026-1002）：通过后才执行登录
      const capRes = await fetch("/api/auth/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captchaToken, answer: captchaInput.trim() }),
      });
      const capData = await capRes.json().catch(() => ({ success: false, error: "验证码校验失败" }));
      if (!capData.success) {
        message.error(capData.error || "验证码错误，请重新输入");
        refreshCaptcha();
        return;
      }

      const result = await signIn("credentials", {
        username: values.username.trim(),
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        // 统一错误文案，避免用户名枚举（FIX-2026-1003）
        message.error("账号或密码错误");
        refreshCaptcha();
      } else {
        message.success("登录成功");
        router.push("/");
        router.refresh();
      }
    } catch { message.error("网络异常，请检查网络连接"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#F8FAFC",
      padding: "0 20px",
    }}>
      {/* 左侧装饰区域（桌面端） */}
      <div style={{
        display: "none",
        // 大屏时显示
      }} />

      {/* 主内容 */}
      <div style={{
        width: "100%",
        maxWidth: 420,
        opacity: fadeIn ? 1 : 0,
        transform: fadeIn ? "translateY(0)" : "translateY(16px)",
        transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Logo + 标题 */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 12px",
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 2px 12px rgba(37,99,235,0.15)",
          }}>
            <img src="/logo.png" alt="" style={{ width: 56, height: 56, objectFit: "cover" }} />
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "#0F172A" }}>
            {systemInfo.companyName}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>
            YUNCANG INVENTORY MANAGEMENT
          </p>
          {systemInfo.contactPhone && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748B" }}>
              <PhoneOutlined style={{ marginRight: 4 }} />{systemInfo.contactPhone}
            </p>
          )}
        </div>

        {/* 登录卡片（与系统内 Card 风格一致） */}
        <div style={{
          background: "#fff",
          borderRadius: 12,
          padding: "32px 28px 24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0F172A" }}>账号登录</h2>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>请输入账号信息登录系统</p>
          </div>

          <Form name="login" onFinish={onFinish} autoComplete="off" layout="vertical" size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: "请输入用户名" }, { whitespace: true, message: "用户名不能包含空格" }]}
              style={{ marginBottom: 18 }}
            >
              <Input
                prefix={<UserOutlined style={{ color: "#64748B" }} />}
                placeholder="账号 / 邮箱 / 手机号"
                style={{ height: 44, borderRadius: 8 }}
                maxLength={32}
                disabled={loading}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: "请输入密码" }]}
              style={{ marginBottom: 18 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "#64748B" }} />}
                placeholder="密码"
                style={{ height: 44, borderRadius: 8 }}
                disabled={loading}
              />
            </Form.Item>

            {/* 验证码 */}
            <Form.Item style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <Input
                  id="captcha"
                  name="captcha"
                  value={captchaInput}
                  onChange={e => setCaptchaInput(e.target.value.toUpperCase())}
                  placeholder="输入验证码（不区分大小写）"
                  maxLength={4}
                  style={{
                    height: 44, borderRadius: 8, flex: 1,
                    fontFamily: "monospace", fontSize: 15, letterSpacing: "0.15em",
                    textTransform: "uppercase",
                  }}
                  disabled={loading}
                  onPressEnter={() => {
                    if (!loading) (document.querySelector('form[name="login"]') as HTMLFormElement)?.requestSubmit();
                  }}
                />
                <div
                  onClick={() => !loading && refreshCaptcha()}
                  style={{
                    borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
                    border: "1px solid #d9d9d9", overflow: "hidden",
                    height: 44, display: "flex", alignItems: "center",
                    opacity: loading ? 0.5 : 1, transition: "opacity 0.2s",
                    flexShrink: 0,
                  }}
                  title="点击刷新"
                >
                  {captchaSvg ? (
                    <img
                      src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(captchaSvg)))}`}
                      alt="验证码"
                      style={{ display: "block", width: 120, height: 44 }}
                    />
                  ) : (
                    <span style={{ width: 120, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#94A3B8" }}>加载中…</span>
                  )}
                </div>
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#64748B" }}>
                验证码不区分大小写，点击图片可刷新
              </p>
            </Form.Item>

            {/* 登录按钮 */}
            <Form.Item style={{ marginBottom: 14 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 44, borderRadius: 8, fontSize: 15, fontWeight: 600,
                  background: "#2563EB", borderColor: "#2563EB",
                  boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
                }}
              >
                {loading ? "正在验证..." : "登 录"}
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center', marginTop: -4 }}>
              <a href='/reset-password' style={{ fontSize: 13, color: '#64748B' }}>忘记密码?</a>
            </div>
          </Form>
        </div>

        {/* 协议勾选 */}
        <div style={{
          marginTop: 16, display: "flex", alignItems: "flex-start", gap: 8,
          opacity: fadeIn ? 1 : 0, transition: "opacity 0.5s ease 0.3s",
        }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, cursor: "pointer", accentColor: "#2563EB" }}
            id="agree-check"
          />
          <label htmlFor="agree-check" style={{ fontSize: 12, color: "#64748B", lineHeight: "18px", cursor: "pointer" }}>
            我已阅读并同意
            <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#1677ff", margin: "0 3px" }}>《服务协议》</a>
            和
            <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#1677ff", margin: "0 3px" }}>《隐私政策》</a>
          </label>
        </div>

        {/* 底部 */}
        <div style={{
          marginTop: 24, textAlign: "center",
          opacity: fadeIn ? 1 : 0, transition: "opacity 0.5s ease 0.4s",
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>
            © {new Date().getFullYear()} {systemInfo.companyName}
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#94A3B8" }}>
            <CustomerServiceOutlined style={{ marginRight: 3 }} />
            如有疑问请联系系统管理员
          </p>
        </div>
      </div>
    </div>
  );
}
