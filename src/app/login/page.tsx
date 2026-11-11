"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { App, Form, Input, Typography } from "antd";
import {
  UserOutlined, LockOutlined, PhoneOutlined, CustomerServiceOutlined,
  SafetyCertificateOutlined, CloudServerOutlined, ApartmentOutlined,
  ArrowRightOutlined, KeyOutlined,
} from "@ant-design/icons";
import { LogoMark } from "@/components/brand/Logo";

const { Text } = Typography;

// Exact public error allowlist: unknown exceptions and missing accounts share one message.
const AUTH_MESSAGES: Record<string, string> = {
  CredentialsSignin: "账号或密码错误",
  "账号或密码错误": "账号或密码错误",
  "验证码错误": "验证码错误，请刷新后重新输入",
  "验证码错误，请重新输入": "验证码错误，请刷新后重新输入",
  "验证码参数错误": "验证码已失效，请刷新后重试",
  "验证码参数错误，请点击图片刷新": "验证码已失效，请刷新后重试",
  "验证码已过期，请刷新": "验证码已过期，请刷新后重试",
  "验证码已过期，请点击图片刷新": "验证码已过期，请刷新后重试",
  "请输入验证码": "请输入验证码",
  "动态验证码不正确": "动态验证码不正确，请输入当前的 6 位动态码",
  "请输入两步验证动态码": "请输入两步验证的 6 位动态码",
  "尝试过于频繁，请稍后再试": "尝试过于频繁，请稍后再试",
  "验证过于频繁，请稍后再试": "验证过于频繁，请稍后再试",
  "账号已被临时锁定，请 30 分钟后再试或联系管理员": "尝试次数过多，请 30 分钟后重试或联系管理员",
  "系统配置异常，请联系管理员": "登录服务暂时不可用，请联系管理员",
};
const authMessage = (error: unknown) => typeof error === "string" && Object.prototype.hasOwnProperty.call(AUTH_MESSAGES, error)
  ? AUTH_MESSAGES[error] : "账号或密码错误";

/**
 * 里程表读数：
 * 每一位是一条 0–9 的竖带，只有变化的那一位会滚，位次从右往左编号，位数变化时不会错位。
 */
function Odometer({ text }: { text: string }) {
  const chars = [...text];
  return (
    <span className="yc-odo tnum" role="img" aria-label={text}>
      {chars.map((ch, i) => {
        const digit = /\d/.test(ch) ? Number(ch) : null;
        const key = chars.length - i;
        return (
          <span key={key} className={"yc-odo-cell" + (digit === null ? " is-sep" : "")} aria-hidden="true">
            {digit === null ? (
              ch
            ) : (
              <span
                className="yc-odo-strip"
                style={{ transform: `translateY(-${digit * 10}%)`, transitionDelay: `${(key % 6) * 40}ms` }}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function LoginView() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [captchaStatus, setCaptchaStatus] = useState("");
  const [systemError, setSystemError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const [totpInput, setTotpInput] = useState("");
  // 两步验证按需出现：只有该账号真的开启了 2FA 才渲染这个输入框
  const [needTotp, setNeedTotp] = useState(false);
  const [totpProbing, setTotpProbing] = useState(false);
  // 接口失败 / 慢网络时，允许用户自己点出来，避免被挡在门外
  const [totpManual, setTotpManual] = useState(false);
  const [systemInfo, setSystemInfo] = useState({ companyName: "云仓智能仓储管理平台", contactPhone: "" });
  const [agreed, setAgreed] = useState(false);
  // 登录成功：按钮收成光球 → 圆环描出 → 进入外壳
  const [succeeded, setSucceeded] = useState(false);
  // 左侧仪表时钟：首帧留空，挂载后再走秒，避免 SSR/CSR 时间不一致导致水合告警
  const [clockText, setClockText] = useState("");
  const [dateText, setDateText] = useState("");
  // 按时段问候：首帧留空，挂载后按浏览器时区计算，避免 SSR/CSR 不一致
  const [greeting, setGreeting] = useState("");
  // 一言：只有联网且取到内容才显示，取不到就静默隐藏
  const [hitokoto, setHitokoto] = useState<{ text: string; from: string } | null>(null);
  const router = useRouter();

  /** 按本机时区给出问候语：5-11 早上 / 11-13 中午 / 13-18 下午 / 18-23 晚上 / 其余夜深 */
  const greetingOf = (hour: number) => {
    if (hour >= 5 && hour < 11) return "早上好";
    if (hour >= 11 && hour < 13) return "中午好";
    if (hour >= 13 && hour < 18) return "下午好";
    if (hour >= 18 && hour < 23) return "晚上好";
    return "夜深了";
  };

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setGreeting(greetingOf(d.getHours()));
      setClockText(d.toTimeString().slice(0, 8));
      setDateText(
        `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} · ` +
          "SUN MON TUE WED THU FRI SAT".split(" ")[d.getDay()],
      );
    };
    tick();
    const timer = window.setInterval(() => { if (!document.hidden) tick(); }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/settings/system")
      .then((r) => { if (!r.ok) throw new Error("system"); return r.json(); })
      .then((d) => {
        if (!d.success || !d.data) throw new Error("system");
        if (d.success && d.data) {
          setSystemInfo({
            companyName: d.data.companyName || "云仓智能仓储管理平台",
            contactPhone: d.data.contactPhone || "",
          });
        }
      })
      .catch(() => setSystemError("平台信息加载失败，已显示默认名称；可刷新页面重试"));
  }, []);

  // announce=false：页面首次加载时静默刷新，不提示“验证码已刷新”
  const refreshCaptcha = useCallback(async (announce = true) => {
    setCaptchaInput("");
    setCaptchaToken("");
    setCaptchaLoading(true);
    setCaptchaStatus("正在加载验证码");
    try {
      const res = await fetch("/api/auth/captcha?" + Date.now(), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.token || !data.image) throw new Error("captcha");
      setCaptchaToken(data.token);
      setCaptchaStatus(announce ? "验证码已刷新，请输入新验证码" : "请输入图中 4 位验证码");
      // M6：服务端改为返回 PNG（data URL），不再下发可解析的矢量结构
      setCaptchaImage(data.image || "");
    } catch {
      setCaptchaToken("");
      setCaptchaImage("");
      setCaptchaStatus("验证码加载失败，请使用刷新按钮重试");
    } finally { setCaptchaLoading(false); }
  }, []);

  useEffect(() => { refreshCaptcha(false); }, [refreshCaptcha]);

  // P2-7：已经登录的人再打开 /login 不该看到登录表单（很容易误以为会话掉了）。
  // 先用 session 探一下，有有效会话直接进工作台；探不到就安静留在登录页。
  useEffect(() => {
    let alive = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!alive) return;
        if (s && s.user) {
          const callbackUrl = typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('callbackUrl')
            : null;
          router.replace(callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : '/');
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [router]);

  /**
   * 登录页「一言」：刻意做成「有就用、没有就不显示」
   *  - navigator.onLine 为 false 时根本不发请求（离线环境不显示）
   *  - 服务端代理 2.5s 超时，取不到返回 success:false，这里静默忽略
   *  - 监听 online/offline，断网时立刻把已有内容收起，恢复后重新取
   */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setHitokoto(null);
        return;
      }
      try {
        const res = await fetch("/api/hitokoto", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        if (data?.success && data?.data?.text) {
          setHitokoto({ text: String(data.data.text), from: String(data.data.from || "") });
        }
      } catch {
        if (alive) setHitokoto(null);
      }
    };
    const onOffline = () => setHitokoto(null);
    const onOnline = () => { load(); };
    load();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  /**
   * 账号填完后问一次「这个账号开了两步验证吗」。
   * 失败一律当作没开（页面不显示动态码框），用户仍可用下面的「手动使用两步验证码」展开。
   */
  const probeTotp = useCallback(async (raw: string) => {
    const username = raw.trim();
    if (!username) { setNeedTotp(false); return; }
    setTotpProbing(true);
    try {
      const res = await fetch(`/api/auth/2fa-required?username=${encodeURIComponent(username)}`, { cache: "no-store" });
      if (!res.ok) { setNeedTotp(false); return; }
      const data = await res.json();
      setNeedTotp(data?.data?.required === true);
    } catch {
      setNeedTotp(false);
    } finally {
      setTotpProbing(false);
    }
  }, []);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoginError("");
    if (!agreed) { setLoginError("请先阅读并同意服务协议和隐私政策"); return; }
    if (!captchaInput.trim()) { setLoginError("请输入验证码"); return; }
    if (!captchaToken || captchaLoading) { setLoginError("请先刷新验证码后重试"); return; }

    setLoading(true);
    try {
      // v1.1.1：先做一次「只校验不消费」的验证码预检，这样验证码错了能明确提示，
      // 而不是和密码错误一样只显示「账号或密码错误」。真正的消费仍在服务端 authorize()。
      const preResponse = await fetch("/api/auth/captcha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: captchaToken, answer: captchaInput.trim() }),
      });
      if (preResponse.status === 429) { setLoginError("验证过于频繁，请稍后再试"); return; }
      if (!preResponse.ok) { setLoginError("验证码服务暂时异常，请稍后重试"); return; }
      const pre = await preResponse.json();
      if (pre?.success !== true) {
        setLoginError(authMessage(pre?.error));
        await refreshCaptcha();
        return;
      }

      const result = await signIn("credentials", {
        username: values.username.trim(),
        password: values.password,
        captchaToken,
        captchaAnswer: captchaInput.trim(),
        totp: totpInput.trim(),
        redirect: false,
      });

      if (!result?.ok || result.error) {
        setLoginError(authMessage(result?.error));
        await refreshCaptcha();
      } else {
        // 放 Discharge：按钮收拢成光球，圆环描出、对勾落定，再进入外壳
        setSucceeded(true);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        await new Promise((r) => setTimeout(r, reduced ? 120 : 900));
        message.success("登录成功");
        router.push("/");
        router.refresh();
      }
    } catch {
      setLoginError("网络或登录服务异常，请检查连接后重试");
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

          {/* 里程表时钟：秒位逐格滚动，视觉上像仪表读数 */}
          <div className="yc-login-dial" aria-hidden="true">
            <Odometer text={clockText || "--:--:--"} />
            <span className="yc-login-dial-date">{dateText || "YUNCANG · INVENTORY"}</span>
          </div>
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

          <h1 className="yc-login-title">
            {greeting ? <span className="yc-login-greeting">{greeting}，</span> : null}欢迎回来
          </h1>
          {hitokoto ? (
            <p className="yc-login-quote" title={hitokoto.from ? "—— " + hitokoto.from : undefined}>
              “{hitokoto.text}”{hitokoto.from ? <span className="yc-login-quote-from">—— {hitokoto.from}</span> : null}
            </p>
          ) : null}

          <div id="login-error" role="alert" aria-live="assertive" style={{ color: "#b91c1c", marginBottom: loginError ? 12 : 0 }}>{loginError}</div>
          {systemError && <p role="status" style={{ fontSize: 12 }}>{systemError}</p>}
          <Form name="login" onFinish={onFinish} autoComplete="off" layout="vertical" size="large">
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: "请输入用户名" }, { whitespace: true, message: "请输入账号" }, { max: 100, message: "账号或邮箱最多 100 个字符" }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: "#94A3B8" }} />}
                placeholder="账号 / 邮箱 / 手机号"
                maxLength={100}
                aria-describedby="login-error"
                disabled={loading}
                onBlur={(e) => probeTotp(e.target.value)}
              />
            </Form.Item>

            <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
              <Input.Password prefix={<LockOutlined style={{ color: "#94A3B8" }} />} placeholder="密码" aria-describedby="login-error" disabled={loading} />
            </Form.Item>

            <Form.Item label="验证码" htmlFor="captcha" required>
              <div style={{ display: "flex", gap: 10 }}>
                <Input
                  id="captcha"
                  name="captcha"
                  aria-describedby="captcha-status login-error"
                  autoComplete="off"
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
                <button
                  type="button"
                  aria-label="刷新验证码"
                  disabled={loading || captchaLoading}
                  aria-busy={captchaLoading}
                  onClick={() => refreshCaptcha()}
                  className="yc-captcha"
                  title="看不清？点击刷新"
                  // 服务端验证码图为 150×52：用原尺寸展示，不压成 116×40，避免字符被裁切/压扁
                  style={{ width: 150, height: 52, overflow: "visible" }}
                >
                  {captchaImage ? (
                    <img
                      src={captchaImage}
                      alt="验证码"
                      style={{ display: "block", width: 150, height: 52 }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: "#334155" }}>{captchaLoading ? "加载中…" : "点击重试"}</span>
                  )}
                </button>
              </div>
              <div id="captcha-status" role="status" aria-live="polite" style={{ fontSize: 12, color: "#334155" }}>{captchaStatus}</div>
            </Form.Item>

            {(needTotp || totpManual) ? (
              <div className="yc-login-totp">
                <Form.Item
                  label={<span><KeyOutlined style={{ marginRight: 6 }} />两步验证码</span>}
                  htmlFor="totp"
                  extra="该账号已开启两步验证，请输入身份验证器里的 6 位动态码"
                  style={{ marginBottom: 8 }}
                >
                  <Input
                    id="totp"
                    aria-describedby="login-error"
                    autoComplete="one-time-code"
                    autoFocus
                    value={totpInput}
                    onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.42em', textAlign: 'center', height: 46, fontSize: 17 }}
                    disabled={loading}
                  />
                </Form.Item>
              </div>
            ) : (
              <button
                type="button"
                className="yc-login-totp-toggle"
                onClick={() => setTotpManual(true)}
                disabled={loading || totpProbing}
              >
                {totpProbing ? "正在检查账号安全设置…" : "使用两步验证码登录"}
              </button>
            )}

            <div className="yc-login-submit-slot">
              {succeeded ? (
                <div className="yc-success-orb" role="status" aria-label="登录成功，正在进入">
                  <svg width="30" height="30" viewBox="0 0 46 46" aria-hidden="true">
                    <circle cx="23" cy="23" r="20" strokeDasharray="126" />
                    <path d="m15 23.5 5.5 5.5L31.5 18" strokeDasharray="24" />
                  </svg>
                </div>
              ) : (
                <button
                  type="submit"
                  className={"yc-login-go" + (loading ? " is-loading" : "")}
                  disabled={loading}
                  aria-label={loading ? "正在登录" : "登录"}
                  title={loading ? "正在登录…" : "登录"}
                >
                  <span className="yc-login-go-ring" aria-hidden="true" />
                  {loading ? <span className="yc-login-go-spinner" aria-hidden="true" /> : <ArrowRightOutlined />}
                </button>
              )}
            </div>

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
