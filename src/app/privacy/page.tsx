"use client";

import { Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Paragraph, Text } = Typography;

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#F8FAFC", padding: "40px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 12, padding: "40px 36px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <Link href="/login" style={{ fontSize: 14, color: "#64748B", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <ArrowLeftOutlined /> 返回登录
        </Link>
        <h2 style={{ marginBottom: 8 }}>隐私政策</h2>
        <Text type="secondary">最后更新：2026年8月15日</Text>

        <div style={{ marginTop: 32, lineHeight: 2, color: "#334155", fontSize: 14 }}>
          <h4>1. 信息收集</h4>
          <Paragraph>
            本系统收集以下信息以提供服务：<br/>
            • 账号信息：用户名、密码（加密存储）、手机号、邮箱<br/>
            • 操作记录：登录日志、业务操作日志<br/>
            • 业务数据：商品信息、库存数据、出入库记录等仓储业务数据<br/>
            • 设备信息：IP 地址、浏览器类型（用于安全审计）
          </Paragraph>

          <h4>2. 信息使用</h4>
          <Paragraph>
            收集的信息仅用于：<br/>
            • 提供和维护系统服务<br/>
            • 账号安全验证和身份识别<br/>
            • 业务数据分析和报表生成<br/>
            • 系统安全监控和异常告警
          </Paragraph>

          <h4>3. 信息存储与保护</h4>
          <Paragraph>
            • 用户密码使用 bcrypt 算法加密存储，系统无法获取明文<br/>
            • 验证码 Token 采用一次性消费机制，防止重放攻击<br/>
            • API 接口实施认证鉴权，防止未授权访问<br/>
            • 数据存储在安全的服务器环境中，定期备份
          </Paragraph>

          <h4>4. 信息共享</h4>
          <Paragraph>未经用户同意，我们不会将用户信息出售、出租或以其他方式分享给第三方，法律法规要求除外。</Paragraph>

          <h4>5. 用户权利</h4>
          <Paragraph>
            用户有权：<br/>
            • 查看和修改个人资料<br/>
            • 修改密码<br/>
            • 联系管理员删除账号及相关数据
          </Paragraph>

          <h4>6. Cookie 使用</h4>
          <Paragraph>本系统使用 Session Cookie 维持登录状态，不用于广告追踪。</Paragraph>

          <h4>7. 政策更新</h4>
          <Paragraph>我们可能会不时更新本政策，更新后将在登录页面公示。继续使用本系统即视为同意更新后的政策。</Paragraph>

          <h4>8. 联系方式</h4>
          <Paragraph>如对本隐私政策有疑问，请联系系统管理员。</Paragraph>
        </div>
      </div>
    </div>
  );
}
