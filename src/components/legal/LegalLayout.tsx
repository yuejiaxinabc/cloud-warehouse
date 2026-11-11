"use client";

import { useEffect, useState } from "react";
import { Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Paragraph, Text } = Typography;

export interface LegalMeta {
  title: string;
  version: string;
  updatedAt: string;
  effectiveAt: string;
}

/**
 * 协议类页面的统一外壳（服务协议 / 隐私政策）
 *
 * 页脚的联系方式取自系统设置（companyName / contactPhone / contactEmail），
 * 未登录时该接口只回这三项，正好够用；配置改了页面自动跟着变，不用改代码。
 */
export default function LegalLayout({ meta, children }: { meta: LegalMeta; children: React.ReactNode }) {
  const [company, setCompany] = useState<{ name: string; phone: string; email: string }>({
    name: "云仓智能仓储管理平台",
    phone: "",
    email: "",
  });

  useEffect(() => {
    fetch("/api/settings/system", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.success && d.data) {
          setCompany({
            name: d.data.companyName || "云仓智能仓储管理平台",
            phone: d.data.contactPhone || "",
            email: d.data.contactEmail || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "#F6F8FB", padding: "40px 20px" }}>
      <div
        style={{
          maxWidth: 780,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 22,
          padding: "40px 40px 32px",
          boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 18px 40px -18px rgba(16,24,40,.18)",
        }}
      >
        <Link
          href="/login"
          style={{ fontSize: 14, color: "#64748B", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}
        >
          <ArrowLeftOutlined /> 返回登录
        </Link>

        <h2 style={{ margin: "0 0 8px", fontSize: 26, color: "#0B1220", letterSpacing: "-.3px" }}>{meta.title}</h2>
        <Text type="secondary" style={{ fontSize: 13 }}>
          版本 {meta.version}　·　最后更新 {meta.updatedAt}　·　生效日期 {meta.effectiveAt}
        </Text>

        <div style={{ marginTop: 28, lineHeight: 1.95, color: "#334155", fontSize: 14 }}>{children}</div>

        <div
          style={{
            marginTop: 36,
            paddingTop: 18,
            borderTop: "1px solid #E7EBF0",
            fontSize: 12.5,
            color: "#64748B",
            lineHeight: 1.9,
          }}
        >
          <div>服务提供方：{company.name}</div>
          {company.phone ? <div>联系电话：{company.phone}</div> : null}
          {company.email ? <div>联系邮箱：{company.email}</div> : null}
          <div>如以上信息与实际部署主体不一致，以系统「系统设置」中的配置为准。</div>
        </div>
      </div>
    </div>
  );
}
