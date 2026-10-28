"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { App, Button, Form, Input, Typography } from "antd";
import {
  UserOutlined, LockOutlined, PhoneOutlined, CustomerServiceOutlined,
  SafetyCertificateOutlined, CloudServerOutlined, ApartmentOutlined,
} from "@ant-design/icons";
import { LogoMark } from "@/components/brand/Logo";

const { Text } = Typography;

function LoginView() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [systemInfo, setSystemInfo] = useState({ companyName: "云仓智能仓储管理平台", contactPhone: "" });
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/settings/system")
      .then((r) => r.json())
      .then((d) => {
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
      // v1.1.1：先做一次「只校验不消费」的验证码预检，这样验证码错了能明确提示，
      // 而不是和密码错误一样只显示「账号或密码错误」。真正的消费仍在服务端 authorize()。
      const pre = await fetch("/api/auth/captcha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captchaToken, answer: captchaInput.trim() }),
      })
        .then((r) => r.json())
        .catch(() => null);

      if (pre && pre.success === false) {
        message.error(pre.error || "验证码错误，请重新输入");
        refreshCaptcha();
        return;
      }

      const result = await signIn("credentials", {
        username: values.username.trim(),
        password: values.password,
        captchaToken,
        captchaAnswer: captchaInput.trim(),
        redirect: false,
      });

      if (result?.error) {
        // 账号 / 密码层面的失败依旧统一文案，避免用户名枚举
        message.error("账号或密码错误");
        refreshCaptcha();
      } else {
        message.success("登录成功");
        router.push("/");
        router.refresh();
      }
    } catch {
      message.error("网络异常，请检查网络连接");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="yc-login">
      {/* 左侧品牌区 */}
      <aside className="yc-login-aside">
        <div className="yc-login-aside-head">
          <LogoMark size={40} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: 0.6 }}>云仓</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.72)" }}>智能仓储管理平台</div>
          </div>
        </div>

        <div className="yc-login-aside-body">
          <h2>把仓库管清楚，<br />从每一个货位开始。</h2>
          <p>商品建档、扫码出入库、货位货架可视化、库存分析与预警，一套系统跑完整个仓储闭环。</p>

          <ul>
            <li><ApartmentOutlined /> 四段货位编码，一货位一商品</li>
            <li><CloudServerOutlined /> 库存实时结存，出入库全程留痕</li>
            <li><SafetyCertificateOutlined /> 登录验证码 + 操作审计</li>
          </ul>
        </div>

        <div className="yc-login-aside-foot">
          © {new Date().getFullYear()} 云仓 · 企业级仓储管理
        </div>
      </aside>

      {/* 右侧表单区 */}
      <main className="yc-login-main">
        <div className="yc-login-card">
          <div className="yc-login-brand-sm">
            <LogoMark size={36} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{systemInfo.companyName}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>YUNCANG INVENTORY MANAGEMENT</div>
            </div>
          </div>

          <h1 className="yc-login-title">欢迎回来</h1>
          <p className="yc-login-sub">使用你的账号登录仓储管理后台</p>

          <Form name="login" onFinish={onFinish} autoComplete="off" layout="vertical" size="large">
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: "请输入用户名" }, { whitespace: true, message: "用户名不能包含空格" }]}
            >
              <Input prefix={<UserOutlined style={{ color: "#94A3B8" }} />} placeholder="账号 / 邮箱 / 手机号" maxLength={32} disabled={loading} />
            </Form.Item>

            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password prefix={<LockOutlined style={{ color: "#94A3B8" }} />} placeholder="密码" disabled={loading} />
            </Form.Item>

            <Form.Item label="验证码" required>
              <div style={{ display: "flex", gap: 10 }}>
                <Input
                  id="captcha"
                  name="captcha"
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value.toUpperCase())}
                  placeholder="4 位验证码"
                  maxLength={4}
                  style={{ flex: 1, fontFamily: "ui-monospace, monospace", letterSpacing: "0.24em", textTransform: "uppercase" }}
                  disabled={loading}
                  onPressEnter={() => {
                    if (!loading) (document.querySelector('form[name="login"]') as HTMLFormElement)?.requestSubmit();
                  }}
                />
                <div
                  onClick={() => !loading && refreshCaptcha()}
                  className="yc-captcha"
                  title="看不清？点击刷新"
                >
                  {captchaSvg ? (
                    <img
                      src={`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(captchaSvg)))}`}
                      alt="验证码"
                      style={{ display: "block", width: 116, height: 40 }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>加载中…</span>
                  )}
                </div>
              </div>
            </Form.Item>

            <Form.Item style={{ marginBottom: 12 }}>
              <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontSize: 15, fontWeight: 600 }}>
                {loading ? "正在验证…" : "登 录"}
              </Button>
            </Form.Item>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <a href="/reset-password" style={{ fontSize: 13, color: "var(--text-secondary)" }}>忘记密码？</a>
              <Text style={{ fontSize: 12, color: "var(--text-muted)" }}>
                <SafetyCertificateOutlined style={{ marginRight: 4 }} />安全登录
              </Text>
            </div>
          </Form>

          <div className="yc-login-agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              id="agree-check"
              style={{ marginTop: 2, cursor: "pointer", accentColor: "#2563EB" }}
            />
            <label htmlFor="agree-check">
              我已阅读并同意
              <a href="/terms" target="_blank" rel="noopener noreferrer">《服务协议》</a>
              和
              <a href="/privacy" target="_blank" rel="noopener noreferrer">《隐私政策》</a>
            </label>
          </div>

          <div className="yc-login-foot">
            {systemInfo.contactPhone && (
              <span><PhoneOutlined /> {systemInfo.contactPhone}</span>
            )}
            <span><CustomerServiceOutlined /> 如有疑问请联系系统管理员</span>
          </div>
        </div>
      </main>
    </div>
  );
}

/** 登录页在 dashboard 布局之外，需要自建 App 上下文，App.useApp() 才能拿到实例 */
export default function LoginPage() {
  return (
    <App>
      <LoginView />
    </App>
  );
}
